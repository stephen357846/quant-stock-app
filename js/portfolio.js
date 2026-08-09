/**
 * 模拟持仓管理模块
 * 使用localStorage持久化数据
 */

var Portfolio = (function() {

    var STORAGE_KEY = 'quant_stock_portfolio';
    var SETTINGS_KEY = 'quant_stock_settings';

    // 获取持仓数据
    function getData() {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            try { return JSON.parse(raw); } catch (e) {}
        }
        return {
            cash: 100000,
            positions: [],      // [{ code, name, secid, quantity, avgPrice }]
            trades: [],         // [{ date, code, name, type, price, quantity, amount, fee }]
            initialCapital: 100000
        };
    }

    // 保存数据
    function saveData(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    // 获取设置
    function getSettings() {
        var raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) {
            try { return JSON.parse(raw); } catch (e) {}
        }
        return {
            darkMode: true,
            initialCapital: 100000,
            defaultKlt: 101,
            watchlist: []  // [{ code, name, secid }]
        };
    }

    // 保存设置
    function saveSettings(settings) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    // 获取自选股
    function getWatchlist() {
        var settings = getSettings();
        return settings.watchlist || [];
    }

    // 添加自选股
    function addToWatchlist(stock) {
        var settings = getSettings();
        if (!settings.watchlist) settings.watchlist = [];
        // 检查是否已存在
        var exists = settings.watchlist.some(function(s) { return s.code === stock.code; });
        if (!exists) {
            settings.watchlist.push({ code: stock.code, name: stock.name, secid: stock.secid });
            saveSettings(settings);
            return true;
        }
        return false;
    }

    // 移除自选股
    function removeFromWatchlist(code) {
        var settings = getSettings();
        settings.watchlist = (settings.watchlist || []).filter(function(s) { return s.code !== code; });
        saveSettings(settings);
    }

    // 买入股票
    function buy(stock, price, quantity) {
        var data = getData();
        var amount = price * quantity;
        var fee = Math.max(amount * 0.0005, 5); // 佣金
        var totalCost = amount + fee;

        if (totalCost > data.cash) {
            return { success: false, message: '资金不足' };
        }

        data.cash -= totalCost;

        // 更新持仓
        var pos = data.positions.find(function(p) { return p.code === stock.code; });
        if (pos) {
            var totalQty = pos.quantity + quantity;
            pos.avgPrice = (pos.avgPrice * pos.quantity + price * quantity) / totalQty;
            pos.quantity = totalQty;
        } else {
            data.positions.push({
                code: stock.code,
                name: stock.name,
                secid: stock.secid,
                quantity: quantity,
                avgPrice: price
            });
        }

        // 记录交易
        data.trades.push({
            date: new Date().toLocaleString('zh-CN'),
            code: stock.code,
            name: stock.name,
            type: 'buy',
            price: price,
            quantity: quantity,
            amount: amount,
            fee: fee
        });

        saveData(data);
        return { success: true, data: data };
    }

    // 卖出股票
    function sell(stock, price, quantity) {
        var data = getData();
        var pos = data.positions.find(function(p) { return p.code === stock.code; });

        if (!pos || pos.quantity < quantity) {
            return { success: false, message: '持仓不足' };
        }

        var amount = price * quantity;
        var fee = Math.max(amount * 0.0005, 5);
        var stampTax = amount * 0.001; // 印花税（卖出）
        var netAmount = amount - fee - stampTax;

        data.cash += netAmount;
        pos.quantity -= quantity;

        // 如果清仓，移除持仓
        if (pos.quantity <= 0) {
            data.positions = data.positions.filter(function(p) { return p.code !== stock.code; });
        }

        // 记录交易
        data.trades.push({
            date: new Date().toLocaleString('zh-CN'),
            code: stock.code,
            name: stock.name,
            type: 'sell',
            price: price,
            quantity: quantity,
            amount: amount,
            fee: fee + stampTax
        });

        saveData(data);
        return { success: true, data: data };
    }

    // 获取账户总览
    function getSummary(currentPrices) {
        var data = getData();
        var stockValue = 0;
        var totalCost = 0;

        data.positions.forEach(function(pos) {
            var current = currentPrices[pos.code] || pos.avgPrice;
            stockValue += current * pos.quantity;
            totalCost += pos.avgPrice * pos.quantity;
        });

        var totalAssets = data.cash + stockValue;
        var totalProfit = totalAssets - data.initialCapital;
        var totalProfitPct = data.initialCapital > 0 ? totalProfit / data.initialCapital : 0;
        var stockProfit = stockValue - totalCost;

        return {
            cash: data.cash,
            stockValue: stockValue,
            totalAssets: totalAssets,
            totalProfit: totalProfit,
            totalProfitPct: totalProfitPct,
            stockProfit: stockProfit,
            initialCapital: data.initialCapital,
            positions: data.positions,
            trades: data.trades
        };
    }

    // 重置账户
    function reset() {
        var settings = getSettings();
        var data = {
            cash: settings.initialCapital || 100000,
            positions: [],
            trades: [],
            initialCapital: settings.initialCapital || 100000
        };
        saveData(data);
        return data;
    }

    return {
        getData: getData,
        saveData: saveData,
        getSettings: getSettings,
        saveSettings: saveSettings,
        getWatchlist: getWatchlist,
        addToWatchlist: addToWatchlist,
        removeFromWatchlist: removeFromWatchlist,
        buy: buy,
        sell: sell,
        getSummary: getSummary,
        reset: reset
    };
})();
