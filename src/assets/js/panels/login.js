/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */
const { AZauth, Mojang } = require('minecraft-java-core');
const { ipcRenderer } = require('electron');

import { popup, database, changePanel, accountSelect, addAccount, config, setStatus } from '../utils.js';

class Login {
    static id = "login";
    async init(config) {
        this.config = config;
        this.db = new database();

        // Initialize listeners for both modes
        this.getMicrosoft();
        this.getCrack();

        // Handle switching logic via Toggle
        const loginHome = document.querySelector('.login-home');
        const loginOffline = document.querySelector('.login-offline');
        const toggles = document.querySelectorAll('.toggle-input');

        toggles.forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const isOnline = e.target.checked;

                // Sync all toggles
                toggles.forEach(t => {
                    t.checked = isOnline;
                    // Update icon opacity
                    const container = t.closest('.login-toggle-container');
                    if (container) {
                        const msIcon = container.querySelector('.icon-microsoft');
                        const offIcon = container.querySelector('.icon-offline');
                        if (isOnline) {
                            msIcon.classList.add('active');
                            offIcon.classList.remove('active');
                        } else {
                            msIcon.classList.remove('active');
                            offIcon.classList.add('active');
                        }
                    }
                });

                if (isOnline) {
                    loginOffline.classList.remove('active-mode');
                    loginOffline.classList.add('inactive-mode');

                    loginHome.classList.remove('inactive-mode');
                    loginHome.classList.add('active-mode');
                } else {
                    loginHome.classList.remove('active-mode');
                    loginHome.classList.add('inactive-mode');

                    loginOffline.classList.remove('inactive-mode');
                    loginOffline.classList.add('active-mode');
                }
            });
        });

        // Default open based on config
        let startOnline = true;
        if (typeof this.config.online == 'boolean') {
            startOnline = this.config.online;
        }

        // Set initial state
        if (startOnline) {
            loginHome.classList.add('active-mode');
            loginOffline.classList.add('inactive-mode');
        } else {
            loginHome.classList.add('inactive-mode');
            loginOffline.classList.add('active-mode');
        }

        // Sync toggles to initial state
        toggles.forEach(t => {
            t.checked = startOnline;
            const container = t.closest('.login-toggle-container');
            if (container) {
                const msIcon = container.querySelector('.icon-microsoft');
                const offIcon = container.querySelector('.icon-offline');
                if (startOnline) {
                    msIcon.classList.add('active');
                    offIcon.classList.remove('active');
                } else {
                    msIcon.classList.remove('active');
                    offIcon.classList.add('active');
                }
            }
        });

        // AZAuth check (kept separate as it seems like a 3rd distinct mode)
        if (typeof this.config.online == 'string' && this.config.online.match(/^(http|https):\/\/[^ "]+$/)) {
            this.getAZauth();
            loginHome.classList.remove('active-mode');
            loginHome.classList.add('inactive-mode');
        }

        document.querySelector('.cancel-home').addEventListener('click', () => {
            document.querySelector('.cancel-home').style.display = 'none'
            changePanel('settings')
        })
    }

    async getMicrosoft() {
        console.log('Initializing Microsoft login...');
        let popupLogin = new popup();
        let loginHome = document.querySelector('.login-home');
        let microsoftBtn = document.querySelector('.connect-home');
        // display handled by init/switching logic now

        microsoftBtn.addEventListener("click", () => {
            popupLogin.openPopup({
                title: 'Conexión',
                content: 'Por favor espera...',
                color: 'var(--color)'
            });

            ipcRenderer.invoke('Microsoft-window', this.config.client_id).then(async account_connect => {
                if (account_connect == 'cancel' || !account_connect) {
                    popupLogin.closePopup();
                    return;
                } else {
                    await this.saveData(account_connect)
                    popupLogin.closePopup();
                }

            }).catch(err => {
                popupLogin.openPopup({
                    title: 'Error',
                    content: err,
                    options: true
                });
            });
        })
    }

    async getCrack() {
        console.log('Initializing offline login...');
        let popupLogin = new popup();
        let loginOffline = document.querySelector('.login-offline');
        let emailOffline = document.querySelector('.email-offline');
        let connectOffline = document.querySelector('.connect-offline');
        // display handled by init/switching logic now

        connectOffline.addEventListener('click', async () => {
            if (emailOffline.value.length < 3) {
                popupLogin.openPopup({
                    title: 'Error',
                    content: 'Tu apodo debe tener al menos 3 caracteres.',
                    options: true
                });
                return;
            }

            if (emailOffline.value.match(/ /g)) {
                popupLogin.openPopup({
                    title: 'Error',
                    content: 'Tu apodo no debe contener espacios.',
                    options: true
                });
                return;
            }

            let MojangConnect = await Mojang.login(emailOffline.value);

            if (MojangConnect.error) {
                popupLogin.openPopup({
                    title: 'Error',
                    content: MojangConnect.message,
                    options: true
                });
                return;
            }
            await this.saveData(MojangConnect)
            popupLogin.closePopup();
        });
    }

    async getAZauth() {
        console.log('Initializing AZauth login...');
        let AZauthClient = new AZauth(this.config.online);
        let PopupLogin = new popup();
        let loginAZauth = document.querySelector('.login-AZauth');
        let loginAZauthA2F = document.querySelector('.login-AZauth-A2F');

        let AZauthEmail = document.querySelector('.email-AZauth');
        let AZauthPassword = document.querySelector('.password-AZauth');
        let AZauthA2F = document.querySelector('.A2F-AZauth');
        let connectAZauthA2F = document.querySelector('.connect-AZauth-A2F');
        let AZauthConnectBTN = document.querySelector('.connect-AZauth');
        let AZauthCancelA2F = document.querySelector('.cancel-AZauth-A2F');

        loginAZauth.style.display = 'block';

        AZauthConnectBTN.addEventListener('click', async () => {
            PopupLogin.openPopup({
                title: 'Conexión en curso...',
                content: 'Por favor espera...',
                color: 'var(--color)'
            });

            if (AZauthEmail.value == '' || AZauthPassword.value == '') {
                PopupLogin.openPopup({
                    title: 'Error',
                    content: 'Por favor llena todos los campos.',
                    options: true
                });
                return;
            }

            let AZauthConnect = await AZauthClient.login(AZauthEmail.value, AZauthPassword.value);

            if (AZauthConnect.error) {
                PopupLogin.openPopup({
                    title: 'Error',
                    content: AZauthConnect.message,
                    options: true
                });
                return;
            } else if (AZauthConnect.A2F) {
                loginAZauthA2F.style.display = 'block';
                loginAZauth.style.display = 'none';
                PopupLogin.closePopup();

                AZauthCancelA2F.addEventListener('click', () => {
                    loginAZauthA2F.style.display = 'none';
                    loginAZauth.style.display = 'block';
                });

                connectAZauthA2F.addEventListener('click', async () => {
                    PopupLogin.openPopup({
                        title: 'Conexión en curso...',
                        content: 'Por favor espera...',
                        color: 'var(--color)'
                    });

                    if (AZauthA2F.value == '') {
                        PopupLogin.openPopup({
                            title: 'Error',
                            content: 'Por favor ingresa el código A2F.',
                            options: true
                        });
                        return;
                    }

                    AZauthConnect = await AZauthClient.login(AZauthEmail.value, AZauthPassword.value, AZauthA2F.value);

                    if (AZauthConnect.error) {
                        PopupLogin.openPopup({
                            title: 'Error',
                            content: AZauthConnect.message,
                            options: true
                        });
                        return;
                    }

                    await this.saveData(AZauthConnect)
                    PopupLogin.closePopup();
                });
            } else if (!AZauthConnect.A2F) {
                await this.saveData(AZauthConnect)
                PopupLogin.closePopup();
            }
        });
    }

    async saveData(connectionData) {
        let configClient = await this.db.readData('configClient');
        let account = await this.db.createData('accounts', connectionData)
        let instanceSelect = configClient.instance_select
        let instancesList = await config.getInstanceList()
        configClient.account_selected = account.ID;

        for (let instance of instancesList) {
            if (instance.whitelistActive) {
                let whitelist = instance.whitelist.find(whitelist => whitelist == account.name)
                if (whitelist !== account.name) {
                    if (instance.name == instanceSelect) {
                        let newInstanceSelect = instancesList.find(i => i.whitelistActive == false)
                        configClient.instance_select = newInstanceSelect.name
                        await setStatus(newInstanceSelect.status)
                    }
                }
            }
        }

        await this.db.updateData('configClient', configClient);
        await addAccount(account);
        await accountSelect(account);
        changePanel('home');
    }

    // Helper to refresh state when panel becomes active
    refreshState() {
        const toggles = document.querySelectorAll('.toggle-input');
        // Trigger a change to ensure correct visibility
        if (toggles.length > 0) {
            const event = new Event('change');
            toggles[0].dispatchEvent(event);
        }
    }
}
// Create a singleton instance if possible or simply rely on re-instantiation logic in utils
export default Login;