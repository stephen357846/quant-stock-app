/**
 * 图表渲染模块
 * 使用ECharts渲染K线图、技术指标图、回测收益曲线
 */

var Charts = (function() {

    var klineChart = null;
    var equityChart = null;

    // 初始化K线图（等待ECharts加载完成后执行）
    function initKlineChart(callback) {
        var container = document.getElementById('kline-chart');
        if (!container) return;
        if (!window.echarts) {
            container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:300px;color:#8b949e;">图表组件加载中...</div>';
            window.__onEchartsReady(function() { initKlineChart(callback); });
            return;
        }
        container.innerHTML = '';
        if (klineChart) klineChart.dispose();
        klineChart = echarts.init(container, 'dark');
        window.addEventListener('resize', function() {
            if (klineChart) klineChart.resize();
        });
        if (callback) callback();
    }

    // 渲染K线图 + 技术指标
    // indicator: 'none' | 'ma' | 'macd' | 'boll' | 'kdj' | 'rsi'
    function renderKline(klines, indicator) {
        if (!window.echarts) {
            window.__onEchartsReady(function() { renderKline(klines, indicator); });
            return;
        }
        if (!klineChart) initKlineChart(function() { renderKline(klines, indicator); });
        if (!klineChart) return;

        indicator = indicator || 'none';
        var dates = klines.map(function(k) { return k.date; });
        var ohlc = klines.map(function(k) {
            return [k.open, k.close, k.low, k.high];
        });
        var volumes = klines.map(function(k) { return k.volume; });

        // 基础配置
        var isMobile = window.innerWidth < 768;
        var dataCount = klines.length;

        var option = {
            backgroundColor: 'transparent',
            animation: false,
            progressive: dataCount > 100 ? 200 : 0,
            progressiveThreshold: 100,
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                backgroundColor: 'rgba(22,27,34,0.95)',
                borderColor: '#30363d',
                textStyle: { color: '#e9ecef', fontSize: 12 }
            },
            axisPointer: { link: [{ xAxisIndex: 'all' }] },
            grid: [],
            xAxis: [],
            yAxis: [],
            series: []
        };

        var gridCount = 1;
        var mainGridHeight = '60%';

        // 主图：K线
        option.grid.push({
            left: '8%', right: '3%', top: '5%', height: mainGridHeight
        });
        option.xAxis.push({
            type: 'category', data: dates, scale: true,
            boundaryGap: true, axisLine: { lineStyle: { color: '#30363d' } },
            axisLabel: {
                color: '#8b949e', fontSize: 10,
                interval: isMobile ? Math.max(1, Math.floor(dataCount / 8)) : Math.max(1, Math.floor(dataCount / 15))
            },
            splitLine: { show: false }
        });
        option.yAxis.push({
            type: 'value', scale: true, position: 'right',
            axisLine: { lineStyle: { color: '#30363d' } },
            axisLabel: { color: '#8b949e', fontSize: 10 },
            splitLine: { lineStyle: { color: '#21262d' } }
        });

        // K线系列
        option.series.push({
            name: 'K线', type: 'candlestick', data: ohlc,
            xAxisIndex: 0, yAxisIndex: 0,
            large: dataCount > 60,
            largeThreshold: 60,
            itemStyle: {
                color: '#ef5350',        // 阳线（上涨）红色
                color0: '#26a69a',       // 阴线（下跌）绿色
                borderColor: '#ef5350',
                borderColor0: '#26a69a'
            }
        });

        // 主图叠加指标
        if (indicator === 'ma') {
            var ma5 = Indicators.MA(klines, 5);
            var ma10 = Indicators.MA(klines, 10);
            var ma20 = Indicators.MA(klines, 20);
            var ma60 = Indicators.MA(klines, 60);
            option.series.push(makeLineSeries('MA5', ma5, dates, '#ffb74d', 0, 0));
            option.series.push(makeLineSeries('MA10', ma10, dates, '#42a5f5', 0, 0));
            option.series.push(makeLineSeries('MA20', ma20, dates, '#ab47bc', 0, 0));
            option.series.push(makeLineSeries('MA60', ma60, dates, '#78909c', 0, 0));
        } else if (indicator === 'boll') {
            var boll = Indicators.BOLL(klines, 20, 2);
            option.series.push(makeLineSeries('BOLL上轨', boll.upper, dates, '#ef5350', 0, 0));
            option.series.push(makeLineSeries('BOLL中轨', boll.middle, dates, '#ffc107', 0, 0));
            option.series.push(makeLineSeries('BOLL下轨', boll.lower, dates, '#26a69a', 0, 0));
        }

        // 成交量子图
        option.grid.push({ left: '8%', right: '3%', top: '70%', height: '12%' });
        option.xAxis.push({
            type: 'category', data: dates, gridIndex: 1,
            axisLabel: { show: false }, axisLine: { lineStyle: { color: '#30363d' } },
            axisTick: { show: false }
        });
        option.yAxis.push({
            type: 'value', gridIndex: 1, position: 'right',
            axisLabel: { color: '#8b949e', fontSize: 9, formatter: function(v) {
                return v >= 100000000 ? (v/100000000).toFixed(1)+'亿' : v >= 10000 ? (v/10000).toFixed(0)+'万' : v;
            }},
            splitLine: { show: false }
        });
        option.series.push({
            name: '成交量', type: 'bar', data: volumes.map(function(v, i) {
                return { value: v, itemStyle: { color: klines[i].close >= klines[i].open ? '#ef5350' : '#26a69a' } };
            }), xAxisIndex: 1, yAxisIndex: 1,
            large: dataCount > 60,
            largeThreshold: 60
        });

        // 副图指标
        if (indicator === 'macd') {
            var macd = Indicators.MACD(klines);
            option.grid.push({ left: '8%', right: '3%', top: '85%', height: '12%' });
            option.xAxis.push({
                type: 'category', data: dates, gridIndex: 2,
                axisLabel: { color: '#8b949e', fontSize: 10 }, axisLine: { lineStyle: { color: '#30363d' } }
            });
            option.yAxis.push({ type: 'value', gridIndex: 2, position: 'right', axisLabel: { color: '#8b949e', fontSize: 9 }, splitLine: { lineStyle: { color: '#21262d' } } });
            option.series.push({
                name: 'MACD柱', type: 'bar', data: macd.macd.map(function(v) {
                    if (v === null) return null;
                    return { value: v, itemStyle: { color: v >= 0 ? '#ef5350' : '#26a69a' } };
                }), xAxisIndex: 2, yAxisIndex: 2
            });
            option.series.push(makeLineSeries('DIF', macd.dif, dates, '#ffb74d', 2, 2));
            option.series.push(makeLineSeries('DEA', macd.dea, dates, '#42a5f5', 2, 2));
        } else if (indicator === 'kdj') {
            var kdj = Indicators.KDJ(klines);
            option.grid.push({ left: '8%', right: '3%', top: '85%', height: '12%' });
            option.xAxis.push({
                type: 'category', data: dates, gridIndex: 2,
                axisLabel: { color: '#8b949e', fontSize: 10 }, axisLine: { lineStyle: { color: '#30363d' } }
            });
            option.yAxis.push({ type: 'value', gridIndex: 2, position: 'right', axisLabel: { color: '#8b949e', fontSize: 9 }, splitLine: { lineStyle: { color: '#21262d' } } });
            option.series.push(makeLineSeries('K', kdj.k, dates, '#ffb74d', 2, 2));
            option.series.push(makeLineSeries('D', kdj.d, dates, '#42a5f5', 2, 2));
            option.series.push(makeLineSeries('J', kdj.j, dates, '#ab47bc', 2, 2));
        } else if (indicator === 'rsi') {
            var rsi = Indicators.RSI(klines, 14);
            option.grid.push({ left: '8%', right: '3%', top: '85%', height: '12%' });
            option.xAxis.push({
                type: 'category', data: dates, gridIndex: 2,
                axisLabel: { color: '#8b949e', fontSize: 10 }, axisLine: { lineStyle: { color: '#30363d' } }
            });
            option.yAxis.push({
                type: 'value', gridIndex: 2, position: 'right', min: 0, max: 100,
                axisLabel: { color: '#8b949e', fontSize: 9 }, splitLine: { lineStyle: { color: '#21262d' } }
            });
            option.series.push(makeLineSeries('RSI14', rsi, dates, '#ffb74d', 2, 2));
        }

        klineChart.setOption(option, true);
    }

    // 辅助：创建折线系列
    function makeLineSeries(name, data, dates, color, xAxisIdx, yAxisIdx) {
        return {
            name: name, type: 'line', data: data,
            xAxisIndex: xAxisIdx, yAxisIndex: yAxisIdx,
            smooth: false, symbol: 'none',
            lineStyle: { color: color, width: 1 },
            itemStyle: { color: color }
        };
    }

    // 渲染回测收益曲线
    function renderEquityCurve(result) {
        var container = document.getElementById('bt-equity-chart');
        if (!container) return;
        if (!window.echarts) {
            window.__onEchartsReady(function() { renderEquityCurve(result); });
            return;
        }
        if (equityChart) equityChart.dispose();
        equityChart = echarts.init(container, 'dark');

        var dates = result.equityCurve.map(function(e) { return e.date; });
        var equity = result.equityCurve.map(function(e) { return e.equity.toFixed(2); });
        var buyHold = result.buyHoldEquity.map(function(v) { return v.toFixed(2); });

        // 标记买卖点
        var buyPoints = [];
        var sellPoints = [];
        for (var i = 0; i < result.signals.length; i++) {
            if (result.signals[i] === 1) {
                buyPoints.push({ coord: [dates[i], equity[i]], itemStyle: { color: '#ef5350' } });
            } else if (result.signals[i] === -1) {
                sellPoints.push({ coord: [dates[i], equity[i]], itemStyle: { color: '#26a69a' } });
            }
        }

        var option = {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(22,27,34,0.95)',
                borderColor: '#30363d',
                textStyle: { color: '#e9ecef', fontSize: 12 }
            },
            legend: {
                data: ['策略资产', '买入持有'],
                textStyle: { color: '#8b949e', fontSize: 11 },
                top: 0
            },
            grid: { left: '10%', right: '5%', top: '12%', bottom: '15%' },
            xAxis: {
                type: 'category', data: dates, scale: true,
                axisLine: { lineStyle: { color: '#30363d' } },
                axisLabel: { color: '#8b949e', fontSize: 10 }
            },
            yAxis: {
                type: 'value', scale: true,
                axisLine: { lineStyle: { color: '#30363d' } },
                axisLabel: { color: '#8b949e', fontSize: 10,
                    formatter: function(v) { return (v / 10000).toFixed(1) + '万'; }
                },
                splitLine: { lineStyle: { color: '#21262d' } }
            },
            series: [
                {
                    name: '策略资产', type: 'line', data: equity,
                    smooth: false, symbol: 'none',
                    lineStyle: { color: '#2196f3', width: 2 },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(33,150,243,0.3)' },
                            { offset: 1, color: 'rgba(33,150,243,0.02)' }
                        ])
                    },
                    markPoint: {
                        symbol: 'triangle', symbolSize: 8,
                        data: buyPoints.concat(sellPoints)
                    }
                },
                {
                    name: '买入持有', type: 'line', data: buyHold,
                    smooth: false, symbol: 'none',
                    lineStyle: { color: '#8b949e', width: 1, type: 'dashed' }
                }
            ]
        };

        equityChart.setOption(option);
        window.addEventListener('resize', function() {
            if (equityChart) equityChart.resize();
        });
    }

    // 销毁图表
    function dispose() {
        if (klineChart) { klineChart.dispose(); klineChart = null; }
        if (equityChart) { equityChart.dispose(); equityChart = null; }
    }

    return {
        initKlineChart: initKlineChart,
        renderKline: renderKline,
        renderEquityCurve: renderEquityCurve,
        dispose: dispose
    };
})();
