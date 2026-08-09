/**
 * 技术指标计算模块
 * 所有函数接收K线数据数组，返回指标值数组
 * K线数据格式: { date, open, close, high, low, volume, ... }
 */

var Indicators = (function() {

    // 简单移动平均线 MA
    function MA(klines, period) {
        var result = [];
        for (var i = 0; i < klines.length; i++) {
            if (i < period - 1) {
                result.push(null);
            } else {
                var sum = 0;
                for (var j = 0; j < period; j++) {
                    sum += klines[i - j].close;
                }
                result.push(sum / period);
            }
        }
        return result;
    }

    // 指数移动平均线 EMA
    function EMA(klines, period) {
        var result = [];
        var multiplier = 2 / (period + 1);
        var prevEMA = null;

        for (var i = 0; i < klines.length; i++) {
            if (i === 0) {
                prevEMA = klines[0].close;
                result.push(prevEMA);
            } else if (i < period - 1) {
                result.push(null);
                prevEMA = null;
            } else if (i === period - 1) {
                // 第一个EMA用SMA初始化
                var sum = 0;
                for (var j = 0; j < period; j++) {
                    sum += klines[i - j].close;
                }
                prevEMA = sum / period;
                result.push(prevEMA);
            } else {
                prevEMA = (klines[i].close - prevEMA) * multiplier + prevEMA;
                result.push(prevEMA);
            }
        }
        return result;
    }

    // MACD指标
    // 返回: { dif: [], dea: [], macd: [] }
    function MACD(klines, shortPeriod, longPeriod, signalPeriod) {
        shortPeriod = shortPeriod || 12;
        longPeriod = longPeriod || 26;
        signalPeriod = signalPeriod || 9;

        var emaShort = EMA(klines, shortPeriod);
        var emaLong = EMA(klines, longPeriod);
        var dif = [];
        var dea = [];
        var macd = [];

        for (var i = 0; i < klines.length; i++) {
            if (emaShort[i] !== null && emaLong[i] !== null) {
                dif.push(emaShort[i] - emaLong[i]);
            } else {
                dif.push(null);
            }
        }

        // DEA = EMA(DIF, signalPeriod)
        var validDif = dif.filter(function(v) { return v !== null; });
        var deaValid = [];
        var multiplier = 2 / (signalPeriod + 1);
        var prevDEA = null;

        for (var i = 0; i < validDif.length; i++) {
            if (i === 0) {
                prevDEA = validDif[0];
                deaValid.push(prevDEA);
            } else if (i < signalPeriod - 1) {
                deaValid.push(null);
                prevDEA = null;
            } else if (i === signalPeriod - 1) {
                var sum = 0;
                for (var j = 0; j < signalPeriod; j++) {
                    sum += validDif[i - j];
                }
                prevDEA = sum / signalPeriod;
                deaValid.push(prevDEA);
            } else {
                prevDEA = (validDif[i] - prevDEA) * multiplier + prevDEA;
                deaValid.push(prevDEA);
            }
        }

        // 填充dea和macd
        var validIndex = 0;
        for (var i = 0; i < klines.length; i++) {
            if (dif[i] === null) {
                dea.push(null);
                macd.push(null);
            } else {
                var d = deaValid[validIndex];
                dea.push(d);
                if (d !== null) {
                    macd.push((dif[i] - d) * 2); // MACD柱 = (DIF - DEA) * 2
                } else {
                    macd.push(null);
                }
                validIndex++;
            }
        }

        return { dif: dif, dea: dea, macd: macd };
    }

    // RSI相对强弱指标
    function RSI(klines, period) {
        period = period || 14;
        var result = [];
        var gains = [];
        var losses = [];

        for (var i = 0; i < klines.length; i++) {
            if (i === 0) {
                gains.push(0);
                losses.push(0);
                result.push(null);
            } else {
                var change = klines[i].close - klines[i - 1].close;
                gains.push(change > 0 ? change : 0);
                losses.push(change < 0 ? -change : 0);

                if (i < period) {
                    result.push(null);
                } else {
                    var avgGain, avgLoss;
                    if (i === period) {
                        var sumGain = 0, sumLoss = 0;
                        for (var j = 1; j <= period; j++) {
                            sumGain += gains[j];
                            sumLoss += losses[j];
                        }
                        avgGain = sumGain / period;
                        avgLoss = sumLoss / period;
                    } else {
                        // 平滑
                        avgGain = (result[i - 1] !== null) ?
                            ((gains.slice(i - period + 1, i + 1).reduce(function(a, b) { return a + b; }, 0)) / period) : 0;
                        avgLoss = (losses.slice(i - period + 1, i + 1).reduce(function(a, b) { return a + b; }, 0)) / period;
                    }

                    if (avgLoss === 0) {
                        result.push(100);
                    } else {
                        var rs = avgGain / avgLoss;
                        result.push(100 - (100 / (1 + rs)));
                    }
                }
            }
        }
        return result;
    }

    // KDJ指标
    function KDJ(klines, n, m1, m2) {
        n = n || 9;
        m1 = m1 || 3;
        m2 = m2 || 3;

        var kValues = [];
        var dValues = [];
        var jValues = [];
        var prevK = 50;
        var prevD = 50;

        for (var i = 0; i < klines.length; i++) {
            if (i < n - 1) {
                kValues.push(null);
                dValues.push(null);
                jValues.push(null);
            } else {
                // RSV = (Close - LowestLow) / (HighestHigh - LowestLow) * 100
                var highest = -Infinity;
                var lowest = Infinity;
                for (var j = 0; j < n; j++) {
                    if (klines[i - j].high > highest) highest = klines[i - j].high;
                    if (klines[i - j].low < lowest) lowest = klines[i - j].low;
                }
                var rsv = highest === lowest ? 0 : (klines[i].close - lowest) / (highest - lowest) * 100;

                // K = 2/3 * prevK + 1/3 * RSV
                var k = (2 / 3) * prevK + (1 / 3) * rsv;
                // D = 2/3 * prevD + 1/3 * K
                var d = (2 / 3) * prevD + (1 / 3) * k;
                // J = 3 * K - 2 * D
                var j = 3 * k - 2 * d;

                kValues.push(k);
                dValues.push(d);
                jValues.push(j);

                prevK = k;
                prevD = d;
            }
        }

        return { k: kValues, d: dValues, j: jValues };
    }

    // 布林带 BOLL
    // 返回: { upper: [], middle: [], lower: [] }
    function BOLL(klines, period, multiplier) {
        period = period || 20;
        multiplier = multiplier || 2;

        var upper = [];
        var middle = [];
        var lower = [];

        for (var i = 0; i < klines.length; i++) {
            if (i < period - 1) {
                upper.push(null);
                middle.push(null);
                lower.push(null);
            } else {
                // 中轨 = MA(period)
                var sum = 0;
                for (var j = 0; j < period; j++) {
                    sum += klines[i - j].close;
                }
                var ma = sum / period;

                // 标准差
                var variance = 0;
                for (var j = 0; j < period; j++) {
                    variance += Math.pow(klines[i - j].close - ma, 2);
                }
                var std = Math.sqrt(variance / period);

                middle.push(ma);
                upper.push(ma + multiplier * std);
                lower.push(ma - multiplier * std);
            }
        }

        return { upper: upper, middle: middle, lower: lower };
    }

    // 成交量移动平均
    function VOL_MA(klines, period) {
        var result = [];
        for (var i = 0; i < klines.length; i++) {
            if (i < period - 1) {
                result.push(null);
            } else {
                var sum = 0;
                for (var j = 0; j < period; j++) {
                    sum += klines[i - j].volume;
                }
                result.push(sum / period);
            }
        }
        return result;
    }

    // ATR平均真实波幅
    function ATR(klines, period) {
        period = period || 14;
        var result = [];
        var trs = [];

        for (var i = 0; i < klines.length; i++) {
            if (i === 0) {
                trs.push(klines[0].high - klines[0].low);
                result.push(null);
            } else {
                var tr = Math.max(
                    klines[i].high - klines[i].low,
                    Math.abs(klines[i].high - klines[i - 1].close),
                    Math.abs(klines[i].low - klines[i - 1].close)
                );
                trs.push(tr);

                if (i < period) {
                    result.push(null);
                } else if (i === period) {
                    var sum = 0;
                    for (var j = 1; j <= period; j++) {
                        sum += trs[trs.length - j];
                    }
                    result.push(sum / period);
                } else {
                    var prevATR = result[result.length - 1];
                    result.push((prevATR * (period - 1) + tr) / period);
                }
            }
        }
        return result;
    }

    return {
        MA: MA,
        EMA: EMA,
        MACD: MACD,
        RSI: RSI,
        KDJ: KDJ,
        BOLL: BOLL,
        VOL_MA: VOL_MA,
        ATR: ATR
    };
})();
