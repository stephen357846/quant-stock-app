/**
 * 量化交易策略模块
 * 每个策略函数接收K线数据数组和参数对象
 * 返回信号数组: 1=买入, -1=卖出, 0=持有/无信号
 */

var Strategies = (function() {

    // 策略定义表（用于UI显示和参数配置）
    var strategyDefs = {
        ma_cross: {
            name: '均线交叉策略',
            desc: '短期均线上穿长期均线买入，下穿卖出',
            params: [
                { key: 'shortPeriod', label: '短期均线', default: 5, min: 2, max: 60 },
                { key: 'longPeriod', label: '长期均线', default: 20, min: 5, max: 120 }
            ]
        },
        macd: {
            name: 'MACD金叉死叉',
            desc: 'DIF上穿DEA（金叉）买入，下穿（死叉）卖出',
            params: [
                { key: 'shortPeriod', label: '短期EMA', default: 12, min: 5, max: 30 },
                { key: 'longPeriod', label: '长期EMA', default: 26, min: 10, max: 60 },
                { key: 'signalPeriod', label: '信号线', default: 9, min: 3, max: 20 }
            ]
        },
        rsi: {
            name: 'RSI超买超卖',
            desc: 'RSI低于超卖线买入，高于超买线卖出',
            params: [
                { key: 'period', label: 'RSI周期', default: 14, min: 5, max: 30 },
                { key: 'oversold', label: '超卖线', default: 30, min: 10, max: 40 },
                { key: 'overbought', label: '超买线', default: 70, min: 60, max: 90 }
            ]
        },
        kdj: {
            name: 'KDJ交叉策略',
            desc: 'K线上穿D线（金叉）买入，下穿（死叉）卖出',
            params: [
                { key: 'n', label: 'RSV周期', default: 9, min: 5, max: 20 },
                { key: 'm1', label: 'K平滑', default: 3, min: 2, max: 5 },
                { key: 'm2', label: 'D平滑', default: 3, min: 2, max: 5 }
            ]
        },
        boll: {
            name: '布林带突破策略',
            desc: '价格跌破下轨买入，突破上轨卖出',
            params: [
                { key: 'period', label: '周期', default: 20, min: 10, max: 30 },
                { key: 'multiplier', label: '标准差倍数', default: 2, min: 1, max: 3, step: 0.1 }
            ]
        },
        dual_ma: {
            name: '双均线趋势策略',
            desc: '三均线系统，短期中期均线同时在长期均线上方时买入',
            params: [
                { key: 'shortPeriod', label: '短期均线', default: 10, min: 3, max: 30 },
                { key: 'midPeriod', label: '中期均线', default: 30, min: 10, max: 60 },
                { key: 'longPeriod', label: '长期均线', default: 60, min: 20, max: 120 }
            ]
        }
    };

    // 均线交叉策略
    function maCross(klines, params) {
        var shortPeriod = params.shortPeriod || 5;
        var longPeriod = params.longPeriod || 20;
        var maShort = Indicators.MA(klines, shortPeriod);
        var maLong = Indicators.MA(klines, longPeriod);
        var signals = [];

        for (var i = 0; i < klines.length; i++) {
            if (i === 0 || maShort[i] === null || maLong[i] === null ||
                maShort[i - 1] === null || maLong[i - 1] === null) {
                signals.push(0);
            } else {
                // 金叉：短均线从下方穿越到上方
                if (maShort[i - 1] <= maLong[i - 1] && maShort[i] > maLong[i]) {
                    signals.push(1);
                }
                // 死叉：短均线从上方穿越到下方
                else if (maShort[i - 1] >= maLong[i - 1] && maShort[i] < maLong[i]) {
                    signals.push(-1);
                } else {
                    signals.push(0);
                }
            }
        }
        return signals;
    }

    // MACD金叉死叉策略
    function macdStrategy(klines, params) {
        var shortPeriod = params.shortPeriod || 12;
        var longPeriod = params.longPeriod || 26;
        var signalPeriod = params.signalPeriod || 9;
        var macd = Indicators.MACD(klines, shortPeriod, longPeriod, signalPeriod);
        var signals = [];

        for (var i = 0; i < klines.length; i++) {
            if (i === 0 || macd.dif[i] === null || macd.dea[i] === null ||
                macd.dif[i - 1] === null || macd.dea[i - 1] === null) {
                signals.push(0);
            } else {
                // 金叉
                if (macd.dif[i - 1] <= macd.dea[i - 1] && macd.dif[i] > macd.dea[i]) {
                    signals.push(1);
                }
                // 死叉
                else if (macd.dif[i - 1] >= macd.dea[i - 1] && macd.dif[i] < macd.dea[i]) {
                    signals.push(-1);
                } else {
                    signals.push(0);
                }
            }
        }
        return signals;
    }

    // RSI超买超卖策略
    function rsiStrategy(klines, params) {
        var period = params.period || 14;
        var oversold = params.oversold || 30;
        var overbought = params.overbought || 70;
        var rsi = Indicators.RSI(klines, period);
        var signals = [];
        var position = 0; // 0=空仓, 1=持仓

        for (var i = 0; i < klines.length; i++) {
            if (rsi[i] === null || rsi[i - 1] === null) {
                signals.push(0);
            } else {
                // RSI从超卖区上穿超卖线 -> 买入
                if (position === 0 && rsi[i - 1] < oversold && rsi[i] >= oversold) {
                    signals.push(1);
                    position = 1;
                }
                // RSI从超买区下穿超买线 -> 卖出
                else if (position === 1 && rsi[i - 1] > overbought && rsi[i] <= overbought) {
                    signals.push(-1);
                    position = -1;
                    // 重置
                    setTimeout(function() { position = 0; }, 0);
                    position = 0;
                } else {
                    signals.push(0);
                }
            }
        }
        return signals;
    }

    // KDJ交叉策略
    function kdjStrategy(klines, params) {
        var n = params.n || 9;
        var m1 = params.m1 || 3;
        var m2 = params.m2 || 3;
        var kdj = Indicators.KDJ(klines, n, m1, m2);
        var signals = [];

        for (var i = 0; i < klines.length; i++) {
            if (i === 0 || kdj.k[i] === null || kdj.d[i] === null ||
                kdj.k[i - 1] === null || kdj.d[i - 1] === null) {
                signals.push(0);
            } else {
                // K线上穿D线（金叉），且K<50（低位金叉更可靠）
                if (kdj.k[i - 1] <= kdj.d[i - 1] && kdj.k[i] > kdj.d[i] && kdj.k[i] < 80) {
                    signals.push(1);
                }
                // K线下穿D线（死叉），且K>20
                else if (kdj.k[i - 1] >= kdj.d[i - 1] && kdj.k[i] < kdj.d[i] && kdj.k[i] > 20) {
                    signals.push(-1);
                } else {
                    signals.push(0);
                }
            }
        }
        return signals;
    }

    // 布林带突破策略
    function bollStrategy(klines, params) {
        var period = params.period || 20;
        var multiplier = params.multiplier || 2;
        var boll = Indicators.BOLL(klines, period, multiplier);
        var signals = [];
        var position = 0;

        for (var i = 0; i < klines.length; i++) {
            if (boll.upper[i] === null || boll.lower[i] === null) {
                signals.push(0);
            } else {
                // 价格从下方触及或跌破下轨 -> 买入
                if (position === 0 && klines[i].close <= boll.lower[i]) {
                    signals.push(1);
                    position = 1;
                }
                // 价格从上方触及或突破上轨 -> 卖出
                else if (position === 1 && klines[i].close >= boll.upper[i]) {
                    signals.push(-1);
                    position = 0;
                } else {
                    signals.push(0);
                }
            }
        }
        return signals;
    }

    // 双均线趋势策略（三均线系统）
    function dualMaStrategy(klines, params) {
        var shortPeriod = params.shortPeriod || 10;
        var midPeriod = params.midPeriod || 30;
        var longPeriod = params.longPeriod || 60;
        var maShort = Indicators.MA(klines, shortPeriod);
        var maMid = Indicators.MA(klines, midPeriod);
        var maLong = Indicators.MA(klines, longPeriod);
        var signals = [];

        for (var i = 0; i < klines.length; i++) {
            if (i === 0 || maShort[i] === null || maMid[i] === null || maLong[i] === null ||
                maShort[i - 1] === null || maMid[i - 1] === null || maLong[i - 1] === null) {
                signals.push(0);
            } else {
                // 短期均线和中期均线同时在长期均线上方，且短期上穿中期 -> 买入
                var bullNow = maShort[i] > maLong[i] && maMid[i] > maLong[i];
                var bullPrev = maShort[i - 1] > maLong[i - 1] && maMid[i - 1] > maLong[i - 1];
                var crossUp = maShort[i - 1] <= maMid[i - 1] && maShort[i] > maMid[i];

                if (bullNow && crossUp) {
                    signals.push(1);
                }
                // 短期均线下穿中期均线，或趋势反转 -> 卖出
                else if (maShort[i - 1] >= maMid[i - 1] && maShort[i] < maMid[i]) {
                    signals.push(-1);
                }
                // 短期或中期均线下穿长期均线 -> 卖出
                else if ((maShort[i - 1] > maLong[i - 1] && maShort[i] <= maLong[i]) ||
                         (maMid[i - 1] > maLong[i - 1] && maMid[i] <= maLong[i])) {
                    signals.push(-1);
                } else {
                    signals.push(0);
                }
            }
        }
        return signals;
    }

    // 执行策略
    function run(strategyKey, klines, params) {
        params = params || {};
        switch (strategyKey) {
            case 'ma_cross': return maCross(klines, params);
            case 'macd': return macdStrategy(klines, params);
            case 'rsi': return rsiStrategy(klines, params);
            case 'kdj': return kdjStrategy(klines, params);
            case 'boll': return bollStrategy(klines, params);
            case 'dual_ma': return dualMaStrategy(klines, params);
            default: return klines.map(function() { return 0; });
        }
    }

    return {
        defs: strategyDefs,
        run: run
    };
})();
