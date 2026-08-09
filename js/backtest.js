/**
 * 策略回测引擎
 * 根据策略信号模拟交易，计算收益和风险指标
 */

var Backtest = (function() {

    /**
     * 执行回测
     * @param {Array} klines - K线数据
     * @param {Array} signals - 信号数组 (1=买, -1=卖, 0=持有)
     * @param {Object} config - 配置: { capital, feeRate, slippage }
     * @returns {Object} 回测结果
     */
    function run(klines, signals, config) {
        config = config || {};
        var initialCapital = config.capital || 100000;
        var feeRate = (config.feeRate || 0.05) / 100; // 转为小数
        var slippage = (config.slippage || 0.1) / 100;
        var minFee = 5; // 最低手续费5元

        var cash = initialCapital;
        var shares = 0;
        var position = 0; // 0=空仓, 1=持仓

        var trades = [];          // 交易记录
        var equityCurve = [];     // 每日总资产
        var holdDays = 0;         // 持仓天数
        var maxEquity = initialCapital;
        var maxDrawdown = 0;

        for (var i = 0; i < klines.length; i++) {
            var k = klines[i];
            var signal = signals[i] || 0;
            var closePrice = k.close;

            // 买入信号
            if (signal === 1 && position === 0) {
                var buyPrice = closePrice * (1 + slippage); // 滑点
                var maxShares = Math.floor(cash / (buyPrice * (1 + feeRate)));
                // 取整到100股
                maxShares = Math.floor(maxShares / 100) * 100;
                if (maxShares >= 100) {
                    var cost = maxShares * buyPrice;
                    var fee = Math.max(cost * feeRate, minFee);
                    cash -= (cost + fee);
                    shares = maxShares;
                    position = 1;
                    holdDays = 0;

                    trades.push({
                        date: k.date,
                        type: 'buy',
                        price: buyPrice.toFixed(2),
                        quantity: maxShares,
                        amount: (cost + fee).toFixed(2),
                        fee: fee.toFixed(2),
                        cash: cash.toFixed(2)
                    });
                }
            }

            // 卖出信号
            if (signal === -1 && position === 1 && shares > 0) {
                var sellPrice = closePrice * (1 - slippage); // 滑点
                var revenue = shares * sellPrice;
                var sellFee = Math.max(revenue * feeRate, minFee);
                cash += (revenue - sellFee);

                // 找到对应的买入记录计算单次盈亏
                var lastBuy = null;
                for (var j = trades.length - 1; j >= 0; j--) {
                    if (trades[j].type === 'buy') {
                        lastBuy = trades[j];
                        break;
                    }
                }

                trades.push({
                    date: k.date,
                    type: 'sell',
                    price: sellPrice.toFixed(2),
                    quantity: shares,
                    amount: (revenue - sellFee).toFixed(2),
                    fee: sellFee.toFixed(2),
                    cash: cash.toFixed(2),
                    profit: lastBuy ? (revenue - sellFee - parseFloat(lastBuy.amount)).toFixed(2) : '0.00'
                });

                shares = 0;
                position = 0;
            }

            if (position === 1) holdDays++;

            // 计算当日总资产
            var equity = cash + shares * closePrice;
            equityCurve.push({
                date: k.date,
                equity: equity,
                cash: cash,
                stockValue: shares * closePrice,
                close: closePrice
            });

            // 计算最大回撤
            if (equity > maxEquity) maxEquity = equity;
            var drawdown = (maxEquity - equity) / maxEquity;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }

        // 最后一天如果还持仓，按收盘价平仓计算
        var finalEquity = cash + shares * klines[klines.length - 1].close;

        // 计算各项指标
        var metrics = calculateMetrics(klines, equityCurve, trades, initialCapital, finalCapital, maxDrawdown, holdDays);

        return {
            metrics: metrics.metrics,
            trades: trades,
            equityCurve: equityCurve,
            klines: klines,
            signals: signals,
            buyHoldEquity: metrics.buyHoldEquity
        };

        function finalCapital() {
            return cash + shares * klines[klines.length - 1].close;
        }
    }

    // 计算回测指标
    function calculateMetrics(klines, equityCurve, trades, initialCapital, finalEquityFn, maxDrawdown, holdDays) {
        var finalEquity = typeof finalEquityFn === 'function' ? finalEquityFn() : finalEquityFn;
        var totalReturn = (finalEquity - initialCapital) / initialCapital;
        var tradingDays = klines.length;
        var annualReturn = tradingDays > 0 ? Math.pow(finalEquity / initialCapital, 250 / tradingDays) - 1 : 0;

        // 买入持有收益
        var buyHoldShares = Math.floor(initialCapital / klines[0].close / 100) * 100;
        var buyHoldFinal = buyHoldShares * klines[klines.length - 1].close + (initialCapital - buyHoldShares * klines[0].close);
        var buyHoldReturn = (buyHoldFinal - initialCapital) / initialCapital;
        var buyHoldEquity = klines.map(function(k) {
            return buyHoldShares * k.close + (initialCapital - buyHoldShares * klines[0].close);
        });

        // 交易统计
        var buyTrades = trades.filter(function(t) { return t.type === 'buy'; });
        var sellTrades = trades.filter(function(t) { return t.type === 'sell'; });
        var completeTrades = sellTrades.length;

        // 盈亏统计
        var wins = 0;
        var losses = 0;
        var totalProfit = 0;
        var totalLoss = 0;
        for (var i = 0; i < sellTrades.length; i++) {
            var profit = parseFloat(sellTrades[i].profit || 0);
            if (profit > 0) {
                wins++;
                totalProfit += profit;
            } else {
                losses++;
                totalLoss += Math.abs(profit);
            }
        }
        var winRate = completeTrades > 0 ? wins / completeTrades : 0;
        var avgProfit = wins > 0 ? totalProfit / wins : 0;
        var avgLoss = losses > 0 ? totalLoss / losses : 0;
        var profitLossRatio = avgLoss > 0 ? avgProfit / avgLoss : 0;

        // 夏普比率（简化版，无风险利率取3%）
        var dailyReturns = [];
        for (var i = 1; i < equityCurve.length; i++) {
            if (equityCurve[i - 1].equity > 0) {
                dailyReturns.push((equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity);
            }
        }
        var avgDailyReturn = dailyReturns.length > 0 ?
            dailyReturns.reduce(function(a, b) { return a + b; }, 0) / dailyReturns.length : 0;
        var dailyStd = dailyReturns.length > 0 ?
            Math.sqrt(dailyReturns.reduce(function(sum, r) { return sum + Math.pow(r - avgDailyReturn, 2); }, 0) / dailyReturns.length) : 0;
        var sharpeRatio = dailyStd > 0 ?
            (avgDailyReturn - 0.03 / 250) / dailyStd * Math.sqrt(250) : 0;

        // 盈亏比
        var profitFactor = totalLoss > 0 ? totalProfit / totalLoss : (totalProfit > 0 ? Infinity : 0);

        var metrics = {
            totalReturn: totalReturn,                    // 总收益率
            annualReturn: annualReturn,                   // 年化收益率
            finalEquity: finalEquity,                     // 最终资产
            initialCapital: initialCapital,               // 初始资金
            maxDrawdown: maxDrawdown,                     // 最大回撤
            sharpeRatio: sharpeRatio,                     // 夏普比率
            winRate: winRate,                             // 胜率
            totalTrades: completeTrades,                  // 交易次数
            wins: wins,                                   // 盈利次数
            losses: losses,                               // 亏损次数
            profitLossRatio: profitLossRatio,             // 盈亏比
            profitFactor: profitFactor,                   // 盈利因子
            avgProfit: avgProfit,                         // 平均盈利
            avgLoss: avgLoss,                             // 平均亏损
            holdDays: holdDays,                           // 持仓天数
            buyHoldReturn: buyHoldReturn,                 // 买入持有收益
            tradingDays: tradingDays,                     // 交易天数
            excessReturn: totalReturn - buyHoldReturn     // 超额收益
        };

        return { metrics: metrics, buyHoldEquity: buyHoldEquity };
    }

    // 格式化百分比
    function fmtPct(value) {
        return (value * 100).toFixed(2) + '%';
    }

    // 格式化金额
    function fmtMoney(value) {
        if (Math.abs(value) >= 100000000) {
            return (value / 100000000).toFixed(2) + '亿';
        } else if (Math.abs(value) >= 10000) {
            return (value / 10000).toFixed(2) + '万';
        }
        return value.toFixed(2);
    }

    return {
        run: run,
        fmtPct: fmtPct,
        fmtMoney: fmtMoney
    };
})();
