/**
 * 主应用控制器
 */

var App = (function() {

    // 应用状态
    var state = {
        currentPage: 'home',
        currentStock: null,     // { code, name, secid }
        currentKlt: 101,        // K线周期
        currentIndicator: 'ma', // 当前指标
        klineData: null,        // 当前K线数据
        tradeType: 'buy',       // 交易类型
        backtestStock: null     // 回测股票
    };

    // 防抖/节流工具
    var debounceTimers = {};
    function debounce(key, fn, delay) {
        if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
        debounceTimers[key] = setTimeout(fn, delay);
    }

    var pageTitles = {
        home: '量化炒股Pro',
        quote: '行情',
        strategy: '策略回测',
        portfolio: '模拟持仓',
        settings: '设置'
    };

    // ===== 初始化 =====
    function init() {
        // 注册Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(function(e) {
                console.log('SW registration failed:', e);
            });
        }

        // 加载设置
        loadSettings();

        // 加载首页数据
        loadHomeData();

        // 回车搜索
        document.getElementById('stock-search').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') searchStock();
        });

        document.getElementById('add-stock-input').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                var val = e.target.value.trim();
                if (val) liveSearch(val);
            }
        });

        // 渲染策略参数
        onStrategyChange();

        // 渲染持仓
        renderPortfolio();

        console.log('量化炒股Pro 初始化完成');
    }

    // ===== 页面导航 =====
    function navigate(page) {
        state.currentPage = page;

        // 更新页面显示
        document.querySelectorAll('.page').forEach(function(el) {
            el.classList.remove('active');
        });
        document.getElementById('page-' + page).classList.add('active');

        // 更新导航栏
        document.querySelectorAll('.nav-item').forEach(function(el) {
            el.classList.remove('active');
        });
        document.querySelector('.nav-item[data-page="' + page + '"]').classList.add('active');

        // 更新标题
        document.getElementById('page-title').textContent = pageTitles[page] || '量化炒股Pro';

        // 滚动到顶部
        document.getElementById('main-content').scrollTop = 0;

        // 页面加载回调
        if (page === 'home') loadHomeData();
        if (page === 'portfolio') renderPortfolio();
        if (page === 'quote' && state.currentStock) {
            setTimeout(function() { Charts.initKlineChart(); }, 100);
        }
    }

    // ===== 首页 =====
    function loadHomeData() {
        loadIndices();
        loadWatchlist();
        // 涨幅榜延迟加载，优先渲染大盘+自选
        setTimeout(function() { loadRankList(); }, 200);
    }

    function loadIndices() {
        StockAPI.getIndices(function(err, data) {
            var container = document.getElementById('index-list');
            if (err || !data || data.length === 0) {
                container.innerHTML = '<div class="loading-text">指数加载失败</div>';
                return;
            }
            container.innerHTML = data.map(function(idx) {
                var cls = idx.changePct > 0 ? 'text-up' : idx.changePct < 0 ? 'text-down' : 'text-flat';
                var arrow = idx.changePct > 0 ? '▲' : idx.changePct < 0 ? '▼' : '';
                return '<div class="index-item" onclick="App.searchAndShow(\'' + idx.code + '\')">' +
                    '<div class="index-name">' + idx.name + '</div>' +
                    '<div class="index-price ' + cls + '">' + idx.price.toFixed(2) + '</div>' +
                    '<div class="index-change ' + cls + '">' + arrow + ' ' + Math.abs(idx.changePct).toFixed(2) + '%</div>' +
                '</div>';
            }).join('');
        });
    }

    function loadWatchlist() {
        var watchlist = Portfolio.getWatchlist();
        var container = document.getElementById('watchlist');

        if (watchlist.length === 0) {
            container.innerHTML = '<div class="empty-text">暂无自选股，点击右上角添加</div>';
            return;
        }

        var secids = watchlist.map(function(s) { return s.secid; });
        StockAPI.getBatchQuotes(secids, function(err, quotes) {
            if (err || !quotes) {
                container.innerHTML = '<div class="loading-text">行情加载失败</div>';
                return;
            }

            container.innerHTML = quotes.map(function(q, i) {
                var stock = watchlist[i];
                var cls = q.changePct > 0 ? 'pct-up' : q.changePct < 0 ? 'pct-down' : 'pct-flat';
                var arrow = q.changePct > 0 ? '+' : '';
                return '<div class="watchlist-item" onclick="App.searchAndShow(\'' + stock.code + '\')">' +
                    '<div class="stock-info-left">' +
                        '<span class="stock-name">' + stock.name + '</span>' +
                        '<span class="stock-code">' + stock.code + '</span>' +
                    '</div>' +
                    '<div class="stock-price-right">' +
                        '<div class="stock-price-val ' + (q.changePct > 0 ? 'text-up' : q.changePct < 0 ? 'text-down' : '') + '">' + q.price.toFixed(2) + '</div>' +
                        '<span class="stock-change-pct ' + cls + '">' + arrow + q.changePct.toFixed(2) + '%</span>' +
                    '</div>' +
                '</div>';
            }).join('');
        });
    }

    function loadRankList() {
        StockAPI.getRankList('gainers', function(err, data) {
            var container = document.getElementById('top-gainers');
            if (err || !data) {
                container.innerHTML = '<div class="loading-text">加载失败</div>';
                return;
            }
            renderRankList(container, data);
        });

        StockAPI.getRankList('losers', function(err, data) {
            var container = document.getElementById('top-losers');
            if (err || !data) {
                container.innerHTML = '<div class="loading-text">加载失败</div>';
                return;
            }
            renderRankList(container, data);
        });
    }

    function renderRankList(container, data) {
        container.innerHTML = data.slice(0, 8).map(function(stock, i) {
            var rankCls = i < 3 ? 'rank-' + (i + 1) : 'rank-other';
            var cls = stock.changePct > 0 ? 'pct-up' : 'pct-down';
            var arrow = stock.changePct > 0 ? '+' : '';
            return '<div class="rank-item" onclick="App.searchAndShow(\'' + stock.code + '\')">' +
                '<div class="stock-info-left">' +
                    '<span class="rank-badge ' + rankCls + '">' + (i + 1) + '</span>' +
                    '<span class="stock-name">' + stock.name + '</span>' +
                    '<span class="stock-code">' + stock.code + '</span>' +
                '</div>' +
                '<div class="stock-price-right">' +
                    '<div class="stock-price-val">' + stock.price.toFixed(2) + '</div>' +
                    '<span class="stock-change-pct ' + cls + '">' + arrow + stock.changePct.toFixed(2) + '%</span>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    // ===== 股票搜索 =====
    function searchStock() {
        var keyword = document.getElementById('stock-search').value.trim();
        if (!keyword) return;
        doSearch(keyword, 'search-results', function(stock) {
            showStockDetail(stock);
        });
    }

    function searchAndShow(code) {
        doSearch(code, 'search-results', function(stock) {
            showStockDetail(stock);
        });
    }

    function doSearch(keyword, resultContainerId, callback) {
        showLoading('搜索中...');
        StockAPI.searchStock(keyword, function(err, results) {
            hideLoading();
            if (err) {
                showToast('搜索失败: ' + err.message);
                return;
            }
            if (results.length === 0) {
                showToast('未找到相关股票');
                return;
            }
            if (results.length === 1) {
                callback(results[0]);
                document.getElementById(resultContainerId).innerHTML = '';
                return;
            }
            var container = document.getElementById(resultContainerId);
            container.innerHTML = results.map(function(s) {
                return '<div class="search-result-item" onclick="App.selectSearchResult(\'' + s.code + '\',\'' + s.name + '\',\'' + s.secid + '\')">' +
                    '<div><span class="stock-name">' + s.name + '</span> <span class="stock-code">' + s.code + '</span></div>' +
                    '<span class="text-muted">选择</span>' +
                '</div>';
            }).join('');
        });
    }

    function selectSearchResult(code, name, secid) {
        document.getElementById('search-results').innerHTML = '';
        var stock = { code: code, name: name, secid: secid };
        showStockDetail(stock);
    }

    function liveSearch(value) {
        if (!value || value.length < 1) {
            document.getElementById('add-stock-results').innerHTML = '';
            return;
        }
        debounce('liveSearch', function() {
            StockAPI.searchStock(value, function(err, results) {
                if (err || !results) return;
                var container = document.getElementById('add-stock-results');
                container.innerHTML = results.map(function(s) {
                    return '<div class="search-result-item" onclick="App.confirmAddStock(\'' + s.code + '\',\'' + s.name + '\',\'' + s.secid + '\')">' +
                        '<div><span class="stock-name">' + s.name + '</span> <span class="stock-code">' + s.code + '</span></div>' +
                        '<span class="btn-small">+ 添加</span>' +
                    '</div>';
                }).join('');
            });
        }, 300);
    }

    // ===== 股票详情 =====
    function showStockDetail(stock) {
        state.currentStock = stock;
        state.backtestStock = stock;

        document.getElementById('search-results').innerHTML = '';
        document.getElementById('stock-detail').style.display = 'block';

        // 同步到回测页面
        document.getElementById('bt-stock-code').value = stock.code;
        document.getElementById('bt-stock-name').textContent = stock.name + ' (' + stock.code + ')';

        // 加载实时行情
        loadQuote(stock);

        // 加载K线
        loadKline(stock, state.currentKlt);
    }

    function loadQuote(stock) {
        StockAPI.getQuote(stock.secid, function(err, data) {
            if (err || !data) {
                showToast('行情加载失败');
                return;
            }

            document.getElementById('detail-name').textContent = data.name;
            document.getElementById('detail-code').textContent = data.code;
            document.getElementById('detail-price').textContent = data.price.toFixed(2);
            document.getElementById('detail-price').className = 'stock-price ' +
                (data.change > 0 ? 'text-up' : data.change < 0 ? 'text-down' : 'text-flat');

            var changeText = (data.change > 0 ? '+' : '') + data.change.toFixed(2) +
                ' (' + (data.changePct > 0 ? '+' : '') + data.changePct.toFixed(2) + '%)';
            document.getElementById('detail-change').textContent = changeText;
            document.getElementById('detail-change').className = 'stock-change ' +
                (data.change > 0 ? 'text-up' : data.change < 0 ? 'text-down' : 'text-flat');

            document.getElementById('detail-open').textContent = data.open.toFixed(2);
            document.getElementById('detail-high').textContent = data.high.toFixed(2);
            document.getElementById('detail-low').textContent = data.low.toFixed(2);
            document.getElementById('detail-vol').textContent = formatVolume(data.volume);
            document.getElementById('detail-amount').textContent = formatMoney(data.amount);
            document.getElementById('detail-turnover').textContent = data.turnover.toFixed(2) + '%';
        });
    }

    function loadKline(stock, klt) {
        showLoading('加载K线数据...');
        var isMobile = window.innerWidth < 768;
        var limit = klt === 101 ? (isMobile ? 120 : 250) : klt === 102 ? (isMobile ? 60 : 120) : klt === 103 ? (isMobile ? 36 : 60) : 120;
        StockAPI.getKline(stock.secid, klt, 1, limit, function(err, data) {
            hideLoading();
            if (err || !data || !data.klines || data.klines.length === 0) {
                showToast('K线数据加载失败');
                return;
            }
            state.klineData = data.klines;
            Charts.initKlineChart();
            Charts.renderKline(state.klineData, state.currentIndicator);
        });
    }

    function changePeriod(klt) {
        state.currentKlt = klt;
        document.querySelectorAll('.period-btn').forEach(function(btn) {
            btn.classList.remove('active');
        });
        document.querySelector('.period-btn[data-klt="' + klt + '"]').classList.add('active');

        if (state.currentStock) {
            loadKline(state.currentStock, klt);
        }
    }

    function changeIndicator(indicator) {
        state.currentIndicator = indicator;
        if (state.klineData) {
            Charts.renderKline(state.klineData, indicator);
        }
    }

    // ===== 自选股 =====
    function showAddStock() {
        document.getElementById('modal-add-stock').style.display = 'flex';
        document.getElementById('add-stock-input').value = '';
        document.getElementById('add-stock-results').innerHTML = '';
        document.getElementById('add-stock-input').focus();
    }

    function confirmAddStock(code, name, secid) {
        var result = Portfolio.addToWatchlist({ code: code, name: name, secid: secid });
        if (result) {
            showToast('已添加 ' + name + ' 到自选');
        } else {
            showToast(name + ' 已在自选列表中');
        }
        closeModal('modal-add-stock');
        loadWatchlist();
    }

    function addToWatchlist() {
        if (!state.currentStock) {
            showToast('请先选择股票');
            return;
        }
        var result = Portfolio.addToWatchlist(state.currentStock);
        if (result) {
            showToast('已添加 ' + state.currentStock.name + ' 到自选');
        } else {
            showToast(state.currentStock.name + ' 已在自选列表中');
        }
        loadWatchlist();
    }

    // ===== 策略回测 =====
    function onStrategyChange() {
        var strategyKey = document.getElementById('bt-strategy').value;
        var def = Strategies.defs[strategyKey];
        var container = document.getElementById('strategy-params');

        if (!def || !def.params) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">' + def.desc + '</div>' +
            def.params.map(function(p) {
                var step = p.step || 1;
                return '<div class="form-group">' +
                    '<label>' + p.label + '</label>' +
                    '<input type="number" id="param-' + p.key + '" value="' + p.default + '" min="' + p.min + '" max="' + p.max + '" step="' + step + '">' +
                '</div>';
            }).join('');
    }

    function searchForBacktest() {
        var code = document.getElementById('bt-stock-code').value.trim();
        if (!code) {
            showToast('请输入股票代码');
            return;
        }
        showLoading('查找股票...');
        StockAPI.searchStock(code, function(err, results) {
            hideLoading();
            if (err || !results || results.length === 0) {
                showToast('未找到该股票');
                document.getElementById('bt-stock-name').textContent = '';
                return;
            }
            var stock = results[0];
            state.backtestStock = stock;
            document.getElementById('bt-stock-code').value = stock.code;
            document.getElementById('bt-stock-name').textContent = stock.name + ' (' + stock.code + ')';
            document.getElementById('bt-stock-name').style.color = 'var(--color-primary)';
        });
    }

    function runBacktest() {
        if (!state.backtestStock) {
            showToast('请先选择股票');
            return;
        }

        var strategyKey = document.getElementById('bt-strategy').value;
        var def = Strategies.defs[strategyKey];
        var params = {};
        if (def && def.params) {
            def.params.forEach(function(p) {
                var el = document.getElementById('param-' + p.key);
                params[p.key] = el ? parseFloat(el.value) : p.default;
            });
        }

        var period = parseInt(document.getElementById('bt-period').value);
        var capital = parseFloat(document.getElementById('bt-capital').value);
        var fee = parseFloat(document.getElementById('bt-fee').value);
        var slippage = parseFloat(document.getElementById('bt-slippage').value);

        showLoading('获取K线数据...');

        StockAPI.getKline(state.backtestStock.secid, 101, 1, period, function(err, data) {
            if (err || !data || !data.klines || data.klines.length === 0) {
                hideLoading();
                showToast('K线数据获取失败');
                return;
            }

            showLoading('执行策略回测...');

            var klines = data.klines;
            var signals = Strategies.run(strategyKey, klines, params);

            var result = Backtest.run(klines, signals, {
                capital: capital,
                feeRate: fee,
                slippage: slippage
            });

            hideLoading();
            displayBacktestResult(result, def ? def.name : strategyKey);
        });
    }

    function displayBacktestResult(result, strategyName) {
        document.getElementById('backtest-result').style.display = 'block';

        var m = result.metrics;

        // 指标网格
        var metricsHtml = '';
        var metricItems = [
            { label: '总收益率', value: Backtest.fmtPct(m.totalReturn), cls: m.totalReturn >= 0 ? 'text-up' : 'text-down' },
            { label: '年化收益率', value: Backtest.fmtPct(m.annualReturn), cls: m.annualReturn >= 0 ? 'text-up' : 'text-down' },
            { label: '最大回撤', value: Backtest.fmtPct(m.maxDrawdown), cls: 'text-down' },
            { label: '夏普比率', value: m.sharpeRatio.toFixed(2), cls: m.sharpeRatio > 0 ? 'text-up' : 'text-down' },
            { label: '胜率', value: Backtest.fmtPct(m.winRate), cls: m.winRate >= 0.5 ? 'text-up' : 'text-flat' },
            { label: '盈亏比', value: m.profitLossRatio.toFixed(2), cls: m.profitLossRatio >= 1 ? 'text-up' : 'text-down' },
            { label: '交易次数', value: m.totalTrades + '次', cls: '' },
            { label: '盈利/亏损', value: m.wins + '/' + m.losses, cls: '' },
            { label: '最终资产', value: '¥' + Backtest.fmtMoney(m.finalEquity), cls: m.finalEquity >= m.initialCapital ? 'text-up' : 'text-down' },
            { label: '超额收益', value: Backtest.fmtPct(m.excessReturn), cls: m.excessReturn >= 0 ? 'text-up' : 'text-down' }
        ];

        metricsHtml = metricItems.map(function(item) {
            return '<div class="metric-card">' +
                '<div class="metric-label">' + item.label + '</div>' +
                '<div class="metric-value ' + item.cls + '">' + item.value + '</div>' +
            '</div>';
        }).join('');

        document.getElementById('bt-metrics').innerHTML = metricsHtml;

        // 渲染收益曲线
        setTimeout(function() {
            Charts.renderEquityCurve(result);
        }, 100);

        // 交易记录
        var tradesHtml = '';
        if (result.trades.length === 0) {
            tradesHtml = '<div class="empty-text">无交易记录</div>';
        } else {
            tradesHtml = '<table class="trades-table"><thead><tr>' +
                '<th>日期</th><th>类型</th><th>价格</th><th>数量</th><th>金额</th><th>手续费</th>' +
                (result.trades.some(function(t) { return t.profit; }) ? '<th>盈亏</th>' : '') +
            '</tr></thead><tbody>';
            result.trades.forEach(function(t) {
                tradesHtml += '<tr>' +
                    '<td>' + t.date + '</td>' +
                    '<td class="' + (t.type === 'buy' ? 'trade-buy' : 'trade-sell') + '">' + (t.type === 'buy' ? '买入' : '卖出') + '</td>' +
                    '<td>' + t.price + '</td>' +
                    '<td>' + t.quantity + '</td>' +
                    '<td>' + Backtest.fmtMoney(parseFloat(t.amount)) + '</td>' +
                    '<td>' + t.fee + '</td>' +
                    (t.profit !== undefined ? '<td class="' + (parseFloat(t.profit) >= 0 ? 'trade-buy' : 'trade-sell') + '">' + t.profit + '</td>' : '') +
                '</tr>';
            });
            tradesHtml += '</tbody></table>';
        }
        document.getElementById('bt-trades').innerHTML = tradesHtml;

        // 滚动到结果
        document.getElementById('backtest-result').scrollIntoView({ behavior: 'smooth' });
    }

    function switchToBacktest() {
        if (state.currentStock) {
            state.backtestStock = state.currentStock;
            document.getElementById('bt-stock-code').value = state.currentStock.code;
            document.getElementById('bt-stock-name').textContent = state.currentStock.name + ' (' + state.currentStock.code + ')';
        }
        navigate('strategy');
    }

    // ===== 模拟交易 =====
    function showTradeModal() {
        if (!state.currentStock) {
            showToast('请先选择股票');
            return;
        }
        document.getElementById('modal-trade').style.display = 'flex';
        document.getElementById('trade-stock-name').textContent = state.currentStock.name + ' (' + state.currentStock.code + ')';

        // 获取最新价格
        StockAPI.getQuote(state.currentStock.secid, function(err, data) {
            if (err || !data) return;
            document.getElementById('trade-stock-price').textContent = '¥' + data.price.toFixed(2);
            document.getElementById('trade-price').value = data.price.toFixed(2);
            updateTradePreview();
        });

        setTradeType('buy');
    }

    function setTradeType(type) {
        state.tradeType = type;
        document.querySelectorAll('.trade-type-btn').forEach(function(btn) {
            btn.classList.remove('active');
        });
        document.querySelector('.trade-type-btn[data-type="' + type + '"]').classList.add('active');
        document.getElementById('trade-submit').textContent = type === 'buy' ? '确认买入' : '确认卖出';
        document.getElementById('trade-submit').className = 'btn-primary';
        updateTradePreview();
    }

    function setQty(qty) {
        document.getElementById('trade-quantity').value = qty;
        updateTradePreview();
    }

    function updateTradePreview() {
        var price = parseFloat(document.getElementById('trade-price').value) || 0;
        var qty = parseInt(document.getElementById('trade-quantity').value) || 0;
        var amount = price * qty;
        var fee = Math.max(amount * 0.0005, 5);
        var stampTax = state.tradeType === 'sell' ? amount * 0.001 : 0;
        var totalFee = fee + stampTax;
        var total = state.tradeType === 'buy' ? amount + totalFee : amount - totalFee;

        document.getElementById('trade-preview').innerHTML =
            '成交金额: ¥' + amount.toFixed(2) + '<br>' +
            '手续费: ¥' + fee.toFixed(2) + (stampTax > 0 ? ' + 印花税: ¥' + stampTax.toFixed(2) : '') + '<br>' +
            '合计: ¥' + total.toFixed(2);
    }

    function executeTrade() {
        if (!state.currentStock) return;

        var price = parseFloat(document.getElementById('trade-price').value);
        var qty = parseInt(document.getElementById('trade-quantity').value);

        if (!price || price <= 0) { showToast('请输入有效价格'); return; }
        if (!qty || qty < 100) { showToast('数量至少100股'); return; }
        if (qty % 100 !== 0) { showToast('数量须为100的整数倍'); return; }

        var result;
        if (state.tradeType === 'buy') {
            result = Portfolio.buy(state.currentStock, price, qty);
        } else {
            result = Portfolio.sell(state.currentStock, price, qty);
        }

        if (result.success) {
            showToast(state.tradeType === 'buy' ? '买入成功' : '卖出成功');
            closeModal('modal-trade');
            renderPortfolio();
        } else {
            showToast(result.message);
        }
    }

    // ===== 持仓页面 =====
    function renderPortfolio() {
        var data = Portfolio.getData();
        var settings = Portfolio.getSettings();

        // 获取当前价格
        var currentPrices = {};
        var positions = data.positions;

        if (positions.length > 0) {
            var secids = positions.map(function(p) { return p.secid; });
            StockAPI.getBatchQuotes(secids, function(err, quotes) {
                if (quotes) {
                    quotes.forEach(function(q) {
                        currentPrices[q.code] = q.price;
                    });
                }
                renderPortfolioWithData(currentPrices);
            });
        } else {
            renderPortfolioWithData(currentPrices);
        }
    }

    function renderPortfolioWithData(currentPrices) {
        var summary = Portfolio.getSummary(currentPrices);

        // 账户总览
        var profitCls = summary.totalProfit >= 0 ? 'text-up' : 'text-down';
        var profitSign = summary.totalProfit >= 0 ? '+' : '';

        document.getElementById('portfolio-summary').innerHTML =
            '<div class="summary-item"><div class="summary-label">总资产</div><div class="summary-value">¥' + Backtest.fmtMoney(summary.totalAssets) + '</div></div>' +
            '<div class="summary-item"><div class="summary-label">可用资金</div><div class="summary-value">¥' + Backtest.fmtMoney(summary.cash) + '</div></div>' +
            '<div class="summary-item"><div class="summary-label">股票市值</div><div class="summary-value">¥' + Backtest.fmtMoney(summary.stockValue) + '</div></div>' +
            '<div class="summary-item"><div class="summary-label">总盈亏</div><div class="summary-value ' + profitCls + '">' + profitSign + Backtest.fmtMoney(summary.totalProfit) + ' (' + profitSign + Backtest.fmtPct(summary.totalProfitPct) + ')</div></div>';

        // 持仓列表
        var positionsHtml = '';
        if (summary.positions.length === 0) {
            positionsHtml = '<div class="empty-text">暂无持仓</div>';
        } else {
            positionsHtml = summary.positions.map(function(pos) {
                var current = currentPrices[pos.code] || pos.avgPrice;
                var profit = (current - pos.avgPrice) * pos.quantity;
                var profitPct = pos.avgPrice > 0 ? (current - pos.avgPrice) / pos.avgPrice : 0;
                var cls = profit >= 0 ? 'text-up' : 'text-down';
                var sign = profit >= 0 ? '+' : '';
                return '<div class="position-item">' +
                    '<div class="position-header">' +
                        '<div><span class="stock-name">' + pos.name + '</span> <span class="stock-code">' + pos.code + '</span></div>' +
                        '<div class="' + cls + '">' + sign + Backtest.fmtMoney(profit) + ' (' + sign + Backtest.fmtPct(profitPct) + ')</div>' +
                    '</div>' +
                    '<div class="position-details">' +
                        '<span>持仓: ' + pos.quantity + '股</span>' +
                        '<span>成本: ¥' + pos.avgPrice.toFixed(2) + '</span>' +
                        '<span>现价: ¥' + current.toFixed(2) + '</span>' +
                        '<span>市值: ¥' + Backtest.fmtMoney(current * pos.quantity) + '</span>' +
                    '</div>' +
                '</div>';
            }).join('');
        }
        document.getElementById('positions-list').innerHTML = positionsHtml;

        // 交易记录
        var trades = summary.trades;
        var tradesHtml = '';
        if (trades.length === 0) {
            tradesHtml = '<div class="empty-text">暂无交易记录</div>';
        } else {
            // 显示最近20条，倒序
            var recentTrades = trades.slice(-20).reverse();
            tradesHtml = recentTrades.map(function(t) {
                return '<div class="trade-history-item">' +
                    '<div>' +
                        '<span class="trade-tag ' + (t.type === 'buy' ? 'trade-tag-buy' : 'trade-tag-sell') + '">' + (t.type === 'buy' ? '买' : '卖') + '</span> ' +
                        '<span class="stock-name">' + t.name + '</span>' +
                        '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + t.date + '</div>' +
                    '</div>' +
                    '<div style="text-align:right;">' +
                        '<div>¥' + t.price.toFixed(2) + ' × ' + t.quantity + '</div>' +
                        '<div style="font-size:11px;color:var(--text-muted);">¥' + Backtest.fmtMoney(t.amount) + '</div>' +
                    '</div>' +
                '</div>';
            }).join('');
        }
        document.getElementById('trade-history').innerHTML = tradesHtml;
    }

    function resetPortfolio() {
        if (confirm('确定要重置模拟账户吗？所有持仓和交易记录将被清除。')) {
            Portfolio.reset();
            renderPortfolio();
            showToast('账户已重置');
        }
    }

    // ===== 设置 =====
    function loadSettings() {
        var settings = Portfolio.getSettings();
        document.getElementById('dark-mode-toggle').checked = settings.darkMode !== false;
        document.getElementById('setting-capital').value = settings.initialCapital || 100000;
        document.getElementById('setting-default-klt').value = settings.defaultKlt || 101;
        if (settings.darkMode === false) {
            document.body.classList.add('light-theme');
        }
    }

    function saveSettings() {
        var settings = Portfolio.getSettings();
        settings.initialCapital = parseFloat(document.getElementById('setting-capital').value) || 100000;
        settings.defaultKlt = parseInt(document.getElementById('setting-default-klt').value) || 101;
        Portfolio.saveSettings(settings);
        showToast('设置已保存');
    }

    function toggleTheme() {
        var isDark = document.getElementById('dark-mode-toggle').checked;
        if (isDark) {
            document.body.classList.remove('light-theme');
        } else {
            document.body.classList.add('light-theme');
        }
        var settings = Portfolio.getSettings();
        settings.darkMode = isDark;
        Portfolio.saveSettings(settings);
        // 重新渲染图表
        if (state.klineData && state.currentPage === 'quote') {
            Charts.renderKline(state.klineData, state.currentIndicator);
        }
    }

    // ===== 工具方法 =====
    function showModal(id) {
        document.getElementById(id).style.display = 'flex';
    }

    function closeModal(id) {
        document.getElementById(id).style.display = 'none';
    }

    function showToast(msg) {
        var toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(function() {
            toast.classList.remove('show');
        }, 2500);
    }

    function showLoading(text) {
        document.getElementById('loading-text').textContent = text || '处理中...';
        document.getElementById('loading-overlay').style.display = 'flex';
    }

    function hideLoading() {
        document.getElementById('loading-overlay').style.display = 'none';
    }

    function formatVolume(vol) {
        if (vol >= 100000000) return (vol / 100000000).toFixed(2) + '亿股';
        if (vol >= 10000) return (vol / 10000).toFixed(2) + '万股';
        return vol + '股';
    }

    function formatMoney(amount) {
        if (amount >= 100000000) return (amount / 100000000).toFixed(2) + '亿';
        if (amount >= 10000) return (amount / 10000).toFixed(2) + '万';
        return amount.toFixed(2);
    }

    return {
        init: init,
        navigate: navigate,
        searchStock: searchStock,
        searchAndShow: searchAndShow,
        selectSearchResult: selectSearchResult,
        liveSearch: liveSearch,
        showAddStock: showAddStock,
        confirmAddStock: confirmAddStock,
        addToWatchlist: addToWatchlist,
        changePeriod: changePeriod,
        changeIndicator: changeIndicator,
        onStrategyChange: onStrategyChange,
        searchForBacktest: searchForBacktest,
        runBacktest: runBacktest,
        switchToBacktest: switchToBacktest,
        showTradeModal: showTradeModal,
        setTradeType: setTradeType,
        setQty: setQty,
        updateTradePreview: updateTradePreview,
        executeTrade: executeTrade,
        resetPortfolio: resetPortfolio,
        toggleTheme: toggleTheme,
        saveSettings: saveSettings,
        closeModal: closeModal,
        showToast: showToast
    };
})();

// 启动应用
document.addEventListener('DOMContentLoaded', function() {
    App.init();
});
