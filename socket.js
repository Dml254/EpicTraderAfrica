const app_id = '1089';
const socket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${app_id}`);

let isAuthorized = false;
let botSettings = JSON.parse(localStorage.getItem('bot_settings') || '{}');
let currentMarket = botSettings.market === 'RANDOM' ? 'R_10' : (botSettings.market || 'R_10');
let processedContracts = new Set();
let totalSessionProfit = 0;

// Recovery & Strategy State
let currentStake = 0;
let lossCount = 0;
let martingaleLevel = 0;
let compoundingStep = 0;
let baseStake = 0;
let isRecoveryTrade = false;
let waitingForRecoveryResult = false;
let vpsMilestone = 0;
let isBotPaused = false;
let pingInterval = null;
let compoundingHadLoss = false;
let compoundingMartingaleLevel = 0;

socket.onopen = function (e) {
    console.log('[open] Connection established');
};

socket.onmessage = function (event) {
    const data = JSON.parse(event.data);

    if (data.error) {
        console.error('API Error:', data.error.message);
        if (window.showCentralAlert) {
            window.showCentralAlert('API Error', data.error.message, 'error');
        }
        if (window.AppUI && window.AppUI.stopBotUI) {
            window.AppUI.stopBotUI();
        }
        return;
    }

    if (data.msg_type === 'authorize') {
        isAuthorized = true;
        console.log('Authorized');
        socket.send(JSON.stringify({ balance: 1, subscribe: 1 }));
        subscribeToTicks(currentMarket);
    }

    if (data.msg_type === 'balance') {
        updateBalanceUI(data.balance.balance);
    }

    if (data.msg_type === 'tick') {
        updateTickUI(data.tick);
    }

    if (data.msg_type === 'buy') {
        const contractId = data.buy.contract_id;
        console.log('Contract Purchased:', contractId);
        pollContract(contractId);
    }

    if (data.msg_type === 'proposal_open_contract') {
        const contract = data.proposal_open_contract;

        if (contract.exit_tick !== undefined && contract.profit !== undefined) {
            if (!processedContracts.has(contract.contract_id)) {
                processedContracts.add(contract.contract_id);

                const profit = parseFloat(contract.profit);
                totalSessionProfit += profit;
                updateSessionProfitUI(totalSessionProfit);

                handleContractResult(contract);

                const settings = JSON.parse(localStorage.getItem('bot_settings') || '{}');
                const strategy = settings.recoveryStrategy;

                // --- RECOVERY CONTRACT LOGIC (Check results and mode) ---
                if (profit > 0) {
                    // Win: Always reset recovery trade status
                    if (isRecoveryTrade || waitingForRecoveryResult) {
                        console.log('Recovery Win! Reverting to main contract.');
                        isRecoveryTrade = false;
                    }
                } else if (profit < 0) {
                    if (waitingForRecoveryResult) {
                        // Recovery trade lost: Check Continuous Mode
                        if (settings.recoveryContinuousMode === 'on' || settings.recoveryContinuousMode === true) {
                            isRecoveryTrade = true;
                            console.log('Recovery Loss: Staying in recovery (Continuous Mode ON).');
                        } else {
                            isRecoveryTrade = false;
                            console.log('Recovery Loss: Reverting to main (Continuous Mode OFF).');
                        }
                    } else {
                        // Main trade lost: Activate recovery
                        if (settings.recoveryContractActive === 'on' || settings.recoveryContractActive === true) {
                            isRecoveryTrade = true;
                            console.log('Main Loss: Switching to Recovery Contract.');
                        }
                    }
                }

                // --- RECOVERY STRATEGY LOGIC ---
                if (strategy === 'martingale') {
                    const factor = parseFloat(settings.martingaleFactor) || 2;
                    const doAfter = parseInt(settings.martingaleAfter) || 1;
                    const maxLevel = parseInt(settings.maxMartingale) || 3;

                    if (profit < 0) {
                        lossCount++;
                        if (lossCount >= doAfter) {
                            if (martingaleLevel < maxLevel) {
                                martingaleLevel++;
                                currentStake = Number((currentStake * factor).toFixed(2));
                            } else {
                                window.AppUI.stopBotUI();
                                window.showCentralAlert('Max Martingale Hit', `Reached maximum level of ${maxLevel}. Stopping bot.`, 'error');
                                return;
                            }
                        }
                    } else {
                        lossCount = 0;
                        martingaleLevel = 0;
                        currentStake = baseStake;
                    }
                } else if (strategy === 'compounding') {
                    const levels = parseInt(settings.compoundingLevels) || 3;
                    const cFactor = parseFloat(settings.compoundingMartingaleFactor) || 2.0;
                    const cMax = parseInt(settings.maxCompoundingMartingale) || 3;

                    if (profit > 0) {
                        if (compoundingHadLoss) {
                            // Win after loss: Reset to base (Recovery win)
                            console.log('Compounding Recovery Win! Resetting to base stake.');
                            compoundingStep = 0;
                            currentStake = baseStake;
                            compoundingHadLoss = false;
                            compoundingMartingaleLevel = 0;
                        } else if (compoundingStep < levels) {
                            // Normal compounding win
                            currentStake = Number((currentStake + profit).toFixed(2));
                            compoundingStep++;
                            console.log(`Compounding Addition ${compoundingStep}/${levels}. Next Stake: ${currentStake}`);
                        } else {
                            // Goal reached
                            compoundingStep = 0;
                            currentStake = baseStake;
                            window.showToast(`Compounding Goal Reached! Resetting...`, 'success');
                        }
                    } else if (profit < 0) {
                        // Loss: Apply Martingale for compounding
                        compoundingHadLoss = true;
                        if (compoundingMartingaleLevel < cMax) {
                            compoundingMartingaleLevel++;
                            currentStake = Number((currentStake * cFactor).toFixed(2));
                            console.log(`Compounding Martingale Level ${compoundingMartingaleLevel}/${cMax}. Next Stake: ${currentStake}`);
                        } else {
                            // Reached max level
                            window.AppUI.stopBotUI();
                            window.showCentralAlert('Max Compounding Martingale Hit', `Reached level ${cMax}. Stopping bot.`, 'error');
                            return;
                        }
                    }
                }

                // RISK MANAGEMENT
                const takeProfit = parseFloat(settings.takeProfit) || 100;
                const stopLoss = parseFloat(settings.stopLoss) || 100;

                if (totalSessionProfit >= takeProfit) {
                    window.AppUI.stopBotUI();
                    window.showCentralAlert('Take Profit Reached!', `Profit: $${totalSessionProfit.toFixed(2)}`, 'success');
                    return;
                }

                if (totalSessionProfit <= -stopLoss) {
                    window.AppUI.stopBotUI();
                    window.showCentralAlert('Stop Loss Hit', `Loss: $${totalSessionProfit.toFixed(2)}`, 'error');
                    return;
                }

                // --- VPS MODE CHECK (Trading Breaks) ---
                if (settings.vpsModeActive === 'on' || settings.vpsModeActive === true) {
                    const milestoneStep = parseFloat(settings.vpsProfit) || 1.00;
                    const breakDuration = parseInt(settings.vpsBreak) || 60;

                    // Initialize milestone if not set
                    if (vpsMilestone === 0) vpsMilestone = milestoneStep;

                    if (totalSessionProfit >= vpsMilestone) {
                        vpsMilestone += milestoneStep;
                        isBotPaused = true;

                        // Start Pings for connection stability
                        startVPSConnectionWatch();

                        let timeLeft = breakDuration;
                        window.showCentralAlert('VPS Break Active', `Goal milestone reached. Resuming in ${timeLeft}s...`, 'success');

                        const countdown = setInterval(() => {
                            timeLeft--;
                            if (timeLeft > 0) {
                                document.getElementById('alertMessage').textContent = `Goal milestone reached. Resuming in ${timeLeft}s...`;
                            } else {
                                clearInterval(countdown);
                                isBotPaused = false;
                                stopVPSConnectionWatch();
                                window.hideCentralAlert();
                                if (window.isBotRunning) {
                                    window.DerivAPI.buy(settings);
                                }
                            }
                        }, 1000);
                        return; // Stop execution here, countdown will resume
                    }
                }

                // ULTRASONIC RE-ENTRY
                if (window.isBotRunning && !isBotPaused) {
                    window.DerivAPI.buy(settings);
                }
            }
        } else {
            setTimeout(() => {
                pollContract(contract.contract_id);
            }, 100);
        }
    }
};

function pollContract(contractId) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ proposal_open_contract: 1, contract_id: contractId }));
    }
}

function subscribeToTicks(symbol) {
    socket.send(JSON.stringify({ forget_all: 'ticks' }));
    socket.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
}

function updateTickUI(tick) {
    const tickDisplay = document.getElementById('tickDisplay');
    if (tickDisplay) {
        tickDisplay.textContent = parseFloat(tick.quote).toFixed(tick.pip_size);
    }
}

function updateSessionProfitUI(profit) {
    const profitDisplay = document.getElementById('sessionProfitDisplay');
    const progressPercentageText = document.getElementById('progressPercentage');
    const progressCircle = document.getElementById('progressCircle');
    const settings = JSON.parse(localStorage.getItem('bot_settings') || '{}');
    const takeProfit = parseFloat(settings.takeProfit) || 100;
    const stopLoss = parseFloat(settings.stopLoss) || 100;

    if (profitDisplay) {
        const prefix = profit >= 0 ? '+' : '';
        profitDisplay.textContent = `${prefix}$${profit.toFixed(2)}`;
        profitDisplay.parentElement.classList.remove('text-green-400', 'text-red-400');
        profitDisplay.parentElement.classList.add(profit >= 0 ? 'text-green-400' : 'text-red-400');
    }

    if (progressPercentageText && progressCircle) {
        let percentage = profit >= 0 ? (profit / takeProfit) * 100 : (Math.abs(profit) / stopLoss) * 100;
        let color = profit >= 0 ? '#10b981' : '#ef4444';
        percentage = Math.max(0, Math.min(100, percentage));
        progressPercentageText.textContent = `${Math.round(percentage)}%`;
        progressCircle.style.background = `conic-gradient(${color} 0% ${percentage}%, rgba(255, 255, 255, 0.1) ${percentage}% 100%)`;
        progressCircle.style.boxShadow = `0 0 30px ${color}33`;
    }
}

function updateTickHistory(tick) {
    const container = document.getElementById('tickHistoryContainer');
    if (!container) return;
    const lastDigit = parseInt(tick.quote.toString().slice(-1));
    const isEven = lastDigit % 2 === 0;
    const badge = document.createElement('div');
    badge.className = `min-w-[32px] md:min-w-[40px] h-8 md:h-10 rounded border flex items-center justify-center text-[10px] md:text-xs font-mono animate-fade-in ${isEven ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-pink-500/20 text-pink-400 border-pink-500/30'}`;
    badge.textContent = isEven ? 'E' : 'O';
    container.prepend(badge);
    if (container.children.length > 15) container.removeChild(container.lastChild);
}

function handleContractResult(contract) {
    if (window.AppUI && window.AppUI.addTransaction) {
        const time = new Date(contract.exit_tick_time * 1000).toLocaleTimeString([], { hour12: false });
        window.AppUI.addTransaction({
            time: time,
            contract: contract.contract_type,
            exitTick: contract.exit_tick,
            stake: contract.buy_price,
            profit: contract.profit
        });
    }
}

function updateBalanceUI(balance) {
    const balanceDisplay = document.getElementById('balanceDisplay');
    if (balanceDisplay) {
        balanceDisplay.textContent = parseFloat(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
}

function startVPSConnectionWatch() {
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ ping: 1 }));
            console.log('VPS Ping sent...');
        }
    }, 2000);
}

function stopVPSConnectionWatch() {
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
}

socket.onclose = function (event) {
    isAuthorized = false;
    if (window.showCentralAlert) window.showCentralAlert('Connection Lost', 'WebSocket connection closed.', 'error');
    if (window.AppUI && window.AppUI.stopBotUI) window.AppUI.stopBotUI();
};

window.DerivAPI = {
    resetSession: function () {
        totalSessionProfit = 0;
        lossCount = 0;
        martingaleLevel = 0;
        compoundingStep = 0;
        currentStake = 0;
        isRecoveryTrade = false;
        waitingForRecoveryResult = false;
        vpsMilestone = 0;
        isBotPaused = false;
        compoundingHadLoss = false;
        compoundingMartingaleLevel = 0;
        stopVPSConnectionWatch();
        updateSessionProfitUI(0);
    },
    authorize: function (token) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ forget_all: "balance" }));
            socket.send(JSON.stringify({ authorize: token }));
        } else {
            socket.onopen = () => {
                socket.send(JSON.stringify({ forget_all: "balance" }));
                socket.send(JSON.stringify({ authorize: token }));
            };
        }
    },
    buy: function (settings) {
        if (!isAuthorized) return;
        if (currentStake === 0) {
            baseStake = Number((parseFloat(settings.stake) || 0.35).toFixed(2));
            currentStake = baseStake;
        }

        // Track if THIS purchase is for recovery
        waitingForRecoveryResult = isRecoveryTrade;

        let contractType = settings.contractType;
        let barrier = settings.barrier;
        let symbol = settings.market;

        // --- RANDOM MARKET LOGIC ---
        if (symbol === 'RANDOM') {
            const markets = ['R_10', '1HZ10V', 'R_25', '1HZ25V', 'R_50', '1HZ50V', 'R_75', '1HZ75V', 'R_100', '1HZ100V', 'JD10', 'JD25', 'JD50', 'JD75', 'JD100'];
            symbol = markets[Math.floor(Math.random() * markets.length)];
            console.log(`Random Market selected: ${symbol}`);
        }

        if (isRecoveryTrade) {
            contractType = settings.recoveryContractType;
            barrier = settings.recoveryBarrier;

            // If Continuous Mode is OFF, reset after one trade
            // If ON, we wait for a win in the message handler to reset
            if (settings.recoveryContinuousMode !== 'on' && settings.recoveryContinuousMode !== true) {
                isRecoveryTrade = false;
            }
            console.log(`Recovery Trade: Type=${contractType}, Barrier=${barrier}`);
        }

        // --- RANDOM DIFFER LOGIC ---
        if (contractType === 'RANDOM_DIFF') {
            contractType = 'DIGITDIFF';
            barrier = Math.floor(Math.random() * 10).toString();
            console.log(`Random Differ selected. Barrier: ${barrier}`);
        }

        const request = {
            buy: 1,
            subscribe: 1,
            price: currentStake,
            parameters: {
                amount: currentStake,
                basis: 'stake',
                contract_type: contractType,
                currency: 'USD',
                duration: parseInt(settings.duration),
                duration_unit: 't',
                symbol: symbol
            }
        };

        if (['DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER'].includes(contractType)) {
            request.parameters.barrier = barrier;
        }

        socket.send(JSON.stringify(request));
    }
};
