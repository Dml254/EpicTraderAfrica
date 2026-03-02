// Toast Notifications System
window.showToast = function (message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    const colorClass = type === 'success' ? 'border-green-500/50' : 'border-red-500/50';

    toast.className = `glass-card ${colorClass} text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 transform translate-x-full transition-all duration-300 animate-slide-in pointer-events-auto`;
    toast.innerHTML = `
        <div class="w-2 h-2 rounded-full ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}"></div>
        <span class="text-sm font-medium">${message}</span>
    `;

    container.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.remove('translate-x-full'), 100);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-[-20px]');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// Central Alert System
window.showCentralAlert = function (title, message, type = 'success') {
    const alertModal = document.getElementById('centralAlert');
    const titleEl = document.getElementById('alertTitle');
    const messageEl = document.getElementById('alertMessage');
    const iconContainer = document.getElementById('alertIconContainer');
    const iconBg = document.getElementById('alertIconBg');

    if (!alertModal || !titleEl || !messageEl || !iconContainer) return;

    titleEl.textContent = title;
    messageEl.textContent = message;

    if (type === 'success') {
        iconContainer.className = "w-20 h-20 rounded-2xl flex items-center justify-center mb-2 bg-green-500/20 text-green-400 border border-green-500/30";
        iconBg.className = "absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-green-500/10 rounded-full blur-3xl -z-10";
        iconContainer.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>';
    } else {
        iconContainer.className = "w-20 h-20 rounded-2xl flex items-center justify-center mb-2 bg-red-500/20 text-red-400 border border-red-500/30";
        iconBg.className = "absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-red-500/10 rounded-full blur-3xl -z-10";
        iconContainer.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>';
    }

    alertModal.classList.add('active');
    alertModal.classList.remove('invisible', 'opacity-0');
};

window.hideCentralAlert = function () {
    const alertModal = document.getElementById('centralAlert');
    if (alertModal) {
        alertModal.classList.remove('active');
        alertModal.classList.add('invisible', 'opacity-0');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const dropdownBtn = document.getElementById('accountDropdownBtn');
    const dropdownMenu = document.getElementById('accountDropdownMenu');
    const dropdownArrow = document.getElementById('dropdownArrow');
    const currentAccountType = document.getElementById('currentAccountType');
    const accountOptions = document.querySelectorAll('.account-option');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettings = document.getElementById('closeSettings');
    const settingsForm = document.getElementById('settingsForm');
    const addTokenBtn = document.getElementById('addTokenBtn');
    const tokenModal = document.getElementById('tokenModal');
    const closeTokenModal = document.getElementById('closeTokenModal');
    const tokenForm = document.getElementById('tokenForm');
    const botControlBtn = document.getElementById('botControlBtn');

    let isDropdownOpen = false;

    // Dropdown Logic
    const toggleDropdown = (show) => {
        isDropdownOpen = show;
        if (show) {
            dropdownMenu.classList.remove('invisible', 'opacity-0', 'scale-95');
            dropdownMenu.classList.add('opacity-100', 'scale-100');
            dropdownArrow.classList.add('rotate-180');
        } else {
            dropdownMenu.classList.add('invisible', 'opacity-0', 'scale-95');
            dropdownMenu.classList.remove('opacity-100', 'scale-100');
            dropdownArrow.classList.remove('rotate-180');
        }
    };

    dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown(!isDropdownOpen);
    });

    accountOptions.forEach(option => {
        option.addEventListener('click', () => {
            const type = option.getAttribute('data-type');
            currentAccountType.textContent = type;
            toggleDropdown(false);

            const tokens = JSON.parse(localStorage.getItem('deriv_tokens') || '{}');
            const token = type === 'Real Account' ? tokens.realToken : tokens.demoToken;
            if (token && window.DerivAPI) window.DerivAPI.authorize(token);
        });
    });

    // Modals Handling
    const handleModal = (modal, show) => {
        if (show) {
            if (modal === settingsModal) prefillSettings();
            modal.classList.add('active');
        } else modal.classList.remove('active');
    };

    const prefillSettings = () => {
        const settings = JSON.parse(localStorage.getItem('bot_settings') || '{}');
        Object.keys(settings).forEach(key => {
            const input = settingsForm.elements[key];
            if (!input) return;

            if (input.type === 'checkbox') {
                input.checked = settings[key] === 'on' || settings[key] === true;
            } else {
                input.value = settings[key];
            }
        });

        // Trigger recovery strategy fields toggle after prefill
        if (settings.recoveryStrategy) {
            updateRecoveryFields(settings.recoveryStrategy);
        }

        // Trigger recovery contract fields toggle after prefill
        const recoveryContractCheck = document.getElementById('recoveryContractCheck');
        if (recoveryContractCheck) {
            updateRecoveryContractFields(recoveryContractCheck.checked);
        }

        const recoveryTypeSelect = document.getElementById('recoveryContractType');
        if (recoveryTypeSelect) {
            updateRecoveryBarrierVisibility(recoveryTypeSelect.value);
        }

        // Trigger VPS fields toggle after prefill
        const vpsModeCheck = document.getElementById('vpsModeCheck');
        if (vpsModeCheck) {
            updateVPSFields(vpsModeCheck.checked);
        }
    };

    const updateRecoveryFields = (strategy) => {
        const martingaleFields = document.getElementById('martingaleFields');
        const compoundingFields = document.getElementById('compoundingFields');

        martingaleFields.classList.add('hidden');
        compoundingFields.classList.add('hidden');

        if (strategy === 'martingale') martingaleFields.classList.remove('hidden');
        else if (strategy === 'compounding') compoundingFields.classList.remove('hidden');
    };

    const updateRecoveryContractFields = (show) => {
        const fields = document.getElementById('recoveryContractFields');
        if (show) fields.classList.remove('hidden');
        else fields.classList.add('hidden');
    };

    const updateRecoveryBarrierVisibility = (type) => {
        const barrierField = document.getElementById('recoveryBarrierField');
        if (['DIGITOVER', 'DIGITUNDER'].includes(type)) {
            barrierField.classList.remove('hidden');
        } else {
            barrierField.classList.add('hidden');
        }
    };

    const updateVPSFields = (show) => {
        const fields = document.getElementById('vpsFields');
        if (show) fields.classList.remove('hidden');
        else fields.classList.add('hidden');
    };

    const recoverySelect = document.getElementById('recoverySelect');
    if (recoverySelect) {
        recoverySelect.addEventListener('change', (e) => {
            updateRecoveryFields(e.target.value);
        });
    }

    const recoveryContractCheck = document.getElementById('recoveryContractCheck');
    if (recoveryContractCheck) {
        recoveryContractCheck.addEventListener('change', (e) => {
            updateRecoveryContractFields(e.target.checked);
        });
    }

    const recoveryContractType = document.getElementById('recoveryContractType');
    if (recoveryContractType) {
        recoveryContractType.addEventListener('change', (e) => {
            updateRecoveryBarrierVisibility(e.target.value);
        });
    }

    const vpsModeCheck = document.getElementById('vpsModeCheck');
    if (vpsModeCheck) {
        vpsModeCheck.addEventListener('change', (e) => {
            updateVPSFields(e.target.checked);
        });
    }

    const prefillTokens = () => {
        const tokens = JSON.parse(localStorage.getItem('deriv_tokens') || '{}');
        Object.keys(tokens).forEach(key => {
            const input = tokenForm.elements[key];
            if (input) input.value = tokens[key];
        });
    };

    settingsBtn.addEventListener('click', () => handleModal(settingsModal, true));
    closeSettings.addEventListener('click', () => handleModal(settingsModal, false));
    addTokenBtn.addEventListener('click', () => {
        toggleDropdown(false);
        prefillTokens();
        handleModal(tokenModal, true);
    });
    closeTokenModal.addEventListener('click', () => handleModal(tokenModal, false));

    // Form Submissions
    settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const settings = Object.fromEntries(new FormData(settingsForm).entries());
        localStorage.setItem('bot_settings', JSON.stringify(settings));
        window.showToast('Settings Saved', 'success');
        setTimeout(() => location.reload(), 1000);
    });

    tokenForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const tokens = Object.fromEntries(new FormData(tokenForm).entries());
        localStorage.setItem('deriv_tokens', JSON.stringify(tokens));
        window.showToast('Tokens Saved', 'success');
        setTimeout(() => location.reload(), 1000);
    });

    // Bot Control
    window.isBotRunning = false;
    const updateBotUI = (running) => {
        if (running) {
            botControlBtn.textContent = 'Stop Bot';
            botControlBtn.classList.remove('bg-blue-600', 'hover:bg-blue-500', 'shadow-blue-900/40');
            botControlBtn.classList.add('bg-red-600', 'hover:bg-red-500', 'shadow-red-900/40');
            window.showToast('Bot Started', 'success');
        } else {
            botControlBtn.textContent = 'Start Bot';
            botControlBtn.classList.add('bg-blue-600', 'hover:bg-blue-500', 'shadow-blue-900/40');
            botControlBtn.classList.remove('bg-red-600', 'hover:bg-red-500', 'shadow-red-900/40');
            window.showToast('Bot Stopped', 'error');
        }
    };

    botControlBtn.addEventListener('click', () => {
        window.isBotRunning = !window.isBotRunning;
        updateBotUI(window.isBotRunning);
        if (window.isBotRunning) {
            // Reset Session Statistics on manual start
            if (window.DerivAPI && window.DerivAPI.resetSession) {
                window.DerivAPI.resetSession();
            }

            const settings = JSON.parse(localStorage.getItem('bot_settings') || '{}');
            if (settings.market && window.DerivAPI) window.DerivAPI.buy(settings);
        }
    });

    // Global UI Object
    window.AppUI = {
        stopBotUI: () => {
            window.isBotRunning = false;
            updateBotUI(false);
        },
        addTransaction: (data) => {
            const tbody = document.getElementById('transactionBody');
            if (!tbody) return;
            const row = document.createElement('tr');
            row.className = "hover:bg-white/5 transition-colors animate-fade-in text-[11px] md:text-sm";
            const isProfit = parseFloat(data.profit) >= 0;
            row.innerHTML = `
                <td class="p-2 md:p-3 text-gray-400">${data.time}</td>
                <td class="p-2 md:p-3 text-gray-200">${data.contract}</td>
                <td class="p-2 md:p-3 text-gray-300">${data.exitTick}</td>
                <td class="p-2 md:p-3 text-gray-400">$${data.stake}</td>
                <td class="p-2 md:p-3 ${isProfit ? 'text-green-400' : 'text-red-400'} text-right font-medium">${isProfit ? '+' : ''}$${data.profit}</td>
            `;
            tbody.prepend(row);
            if (tbody.children.length > 10) tbody.removeChild(tbody.lastChild);
        }
    };

    // Initial Auth
    const tokens = JSON.parse(localStorage.getItem('deriv_tokens') || '{}');
    const type = currentAccountType.textContent;
    const token = type === 'Real Account' ? tokens.realToken : tokens.demoToken;
    if (token && window.DerivAPI) window.DerivAPI.authorize(token);

    // Global click closer
    document.addEventListener('click', (e) => {
        if (isDropdownOpen && !dropdownBtn.contains(e.target) && !dropdownMenu.contains(e.target)) toggleDropdown(false);
    });
});
