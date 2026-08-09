/**
 * 股票数据API模块
 * 数据来源：东方财富网公开API
 * 使用JSONP方式跨域请求
 */
var StockAPI = (function() {

    // JSONP请求
    function jsonp(url, callback) {
        var cbName = 'jsonp_cb_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        var script = document.createElement('script');

        var sep = url.indexOf('?') !== -1 ? '&' : '?';
        script.src = url + sep + 'cb=' + cbName;

        window[cbName] = function(data) {
            try { callback(null, data); } finally {
                delete window[cbName];
                if (script.parentNode) script.parentNode.removeChild(script);
            }
        };

        script.onerror = function() {
            delete window[cbName];
            if (script.parentNode) script.parentNode.removeChild(script);
            callback(new Error('网络请求失败'));
        };

        // 超时处理
        setTimeout(function() {
            if (window[cbName]) {
                delete window[cbName];
                if (script.parentNode) script.parentNode.removeChild(script);
                callback(new Error('请求超时'));
            }
        }, 10000);

        document.head.appendChild(script);
    }

    // 获取市场前缀（secid）
    // 沪市: 6开头 -> 1, 深市: 0/3开头 -> 0, 北交所: 8/4开头 -> 0
    function getSecid(code) {
        code = String(code).replace(/\s/g, '');
        if (/^(6|9)/.test(code)) return '1.' + code;
        if (/^(0|2|3)/.test(code)) return '0.' + code;
        if (/^(8|4)/.test(code)) return '0.' + code;
        return '1.' + code;
    }

    // 搜索股票
    function searchStock(keyword, callback) {
        var url = 'https://searchapi.eastmoney.com/api/suggest/get' +
            '?input=' + encodeURIComponent(keyword) +
            '&type=14' +
            '&token=D43BF722C8E33BDC906FB84D85E326E8' +
            '&count=10';
        jsonp(url, function(err, data) {
            if (err) return callback(err);
            var results = [];
            if (data && data.QuotationCodeTable && data.QuotationCodeTable.Data) {
                results = data.QuotationCodeTable.Data.map(function(item) {
                    return {
                        code: item.Code,
                        name: item.Name,
                        secid: getSecid(item.Code),
                        market: item.Market
                    };
                });
            }
            callback(null, results);
        });
    }

    // 获取实时行情
    function getQuote(secid, callback) {
        var fields = 'f43,f44,f45,f46,f47,f48,f50,f57,f58,f60,f80,f84,f85,f86,f92,f105,f108,f116,f117,f152,f161,f168,f169,f170,f171,f292';
        var url = 'https://push2.eastmoney.com/api/qt/stock/get' +
            '?secid=' + secid +
            '&fields=' + fields;
        jsonp(url, function(err, data) {
            if (err) return callback(err);
            if (!data || !data.data) return callback(new Error('无数据'));
            var d = data.data;
            callback(null, {
                code: d.f57,
                name: d.f58,
                price: d.f43 / 100,
                change: d.f169 / 100,
                changePct: d.f170 / 100,
                open: d.f46 / 100,
                high: d.f44 / 100,
                low: d.f45 / 100,
                preClose: d.f60 / 100,
                volume: d.f47,
                amount: d.f48,
                turnover: d.f168 / 100,
                amplitude: d.f171 / 100,
                pe: d.f162 ? d.f162 / 100 : null,
                marketCap: d.f116,
                floatMarketCap: d.f117,
                pb: d.f84 ? d.f84 / 100 : null
            });
        });
    }

    // 获取K线数据
    // klt: 101=日K 102=周K 103=月K 60=60分 30=30分
    // fqt: 0=不复权 1=前复权 2=后复权
    function getKline(secid, klt, fqt, limit, callback) {
        klt = klt || 101;
        fqt = fqt !== undefined ? fqt : 1;
        limit = limit || 250;

        var url = 'https://push2his.eastmoney.com/api/qt/stock/kline/get' +
            '?secid=' + secid +
            '&klt=' + klt +
            '&fqt=' + fqt +
            '&end=20500101' +
            '&lmt=' + limit +
            '&fields1=f1,f2,f3,f4,f5,f6' +
            '&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61';

        jsonp(url, function(err, data) {
            if (err) return callback(err);
            if (!data || !data.data || !data.data.klines) return callback(new Error('无K线数据'));

            var klines = data.data.klines.map(function(line) {
                var parts = line.split(',');
                return {
                    date: parts[0],
                    open: parseFloat(parts[1]),
                    close: parseFloat(parts[2]),
                    high: parseFloat(parts[3]),
                    low: parseFloat(parts[4]),
                    volume: parseInt(parts[5]),
                    amount: parseFloat(parts[6]),
                    amplitude: parseFloat(parts[7]),
                    changePct: parseFloat(parts[8]),
                    changeAmount: parseFloat(parts[9]),
                    turnover: parseFloat(parts[10])
                };
            });

            callback(null, {
                name: data.data.name,
                code: data.data.code,
                klines: klines
            });
        });
    }

    // 获取大盘指数列表
    function getIndices(callback) {
        // 上证指数、深证成指、创业板指、科创50、沪深300
        var secids = '1.000001,0.399001,0.399006,1.000688,1.000300';
        var fields = 'f2,f3,f4,f12,f14';
        var url = 'https://push2.eastmoney.com/api/qt/ulist.np/get' +
            '?secids=' + secids +
            '&fields=' + fields +
            '&fltt=2';

        jsonp(url, function(err, data) {
            if (err) return callback(err);
            var results = [];
            if (data && data.data && data.data.diff) {
                results = data.data.diff.map(function(item) {
                    return {
                        code: item.f12,
                        name: item.f14,
                        price: item.f2 / 100,
                        changePct: item.f3 / 100,
                        change: item.f4 / 100
                    };
                });
            }
            callback(null, results);
        });
    }

    // 获取涨幅榜/跌幅榜
    // sortField: f3=涨跌幅 f8=换手率
    // sortType: 0=降序 1=升序
    function getRankList(type, callback) {
        type = type || 'gainers'; // gainers | losers
        var sortParams = type === 'gainers'
            ? { sortField: 'f3', sortType: 0 }
            : { sortField: 'f3', sortType: 1 };

        var url = 'https://push2.eastmoney.com/api/qt/clist/get' +
            '?pn=1&pz=10&po=1&np=1' +
            '&fltt=2&invt=2' +
            '&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048' +
            '&fields=f2,f3,f4,f12,f14,f15,f16,f17,f6' +
            '&fid=' + sortParams.sortField +
            '&po=' + (sortParams.sortType === 0 ? 1 : 0);

        jsonp(url, function(err, data) {
            if (err) return callback(err);
            var results = [];
            if (data && data.data && data.data.diff) {
                results = data.data.diff.map(function(item) {
                    return {
                        code: item.f12,
                        name: item.f14,
                        price: item.f2 / 100,
                        changePct: item.f3 / 100,
                        change: item.f4 / 100,
                        high: item.f15 / 100,
                        low: item.f16 / 100,
                        open: item.f17 / 100,
                        amount: item.f6
                    };
                });
            }
            callback(null, results);
        });
    }

    // 批量获取多只股票实时行情
    function getBatchQuotes(secids, callback) {
        var fields = 'f2,f3,f4,f12,f14,f15,f16,f17,f6';
        var url = 'https://push2.eastmoney.com/api/qt/ulist.np/get' +
            '?secids=' + secids.join(',') +
            '&fields=' + fields +
            '&fltt=2';

        jsonp(url, function(err, data) {
            if (err) return callback(err);
            var results = [];
            if (data && data.data && data.data.diff) {
                results = data.data.diff.map(function(item) {
                    return {
                        code: item.f12,
                        name: item.f14,
                        price: item.f2 / 100,
                        changePct: item.f3 / 100,
                        change: item.f4 / 100,
                        high: item.f15 / 100,
                        low: item.f16 / 100,
                        open: item.f17 / 100,
                        amount: item.f6
                    };
                });
            }
            callback(null, results);
        });
    }

    return {
        searchStock: searchStock,
        getQuote: getQuote,
        getKline: getKline,
        getIndices: getIndices,
        getRankList: getRankList,
        getBatchQuotes: getBatchQuotes,
        getSecid: getSecid
    };
})();
