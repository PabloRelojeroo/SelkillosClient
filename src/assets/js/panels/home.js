/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */
import { config, database, logger, changePanel, appdata, setStatus, pkg, popup } from '../utils.js'

const { Launch } = require('minecraft-java-core')
const { shell, ipcRenderer } = require('electron')
import DiscordRPC from './discord-rpc.js';
import InstanceAssetsHandler from './InstanceAssetsHandler.js';

class Home {
    static id = "home";

    async init(config) {
        this.config = config
        this.db = new database()
        this.rpc = new DiscordRPC();
        await this.rpc.init();
        this.assetsHandler = new InstanceAssetsHandler();

        this.currentSelectedInstance = null;
        this.isGameLaunching = false;
        this.playButtonHandler = null; // Handler reference for cleanup

        await this.loadInstanceAssets(); // New sidebar logic
        this.socialLick()
        this.instancesSelect() // Handles play button click
        this.setupInstanceCodeModal() // Security validation modal
        document.querySelector('.settings-btn').addEventListener('click', e => changePanel('settings'))
    }

    showPlayButton() {
        const playBtn = document.querySelector('.play-instance');
        const infoBox = document.querySelector('.info-starting-game');
        if (playBtn) {
            playBtn.style.display = 'flex';
            playBtn.style.visibility = 'visible';
            playBtn.style.opacity = '1';
        }
        if (infoBox) infoBox.style.display = 'none';
    }

    hidePlayButton() {
        const playBtn = document.querySelector('.play-instance');
        if (playBtn) {
            playBtn.style.display = 'none';
            playBtn.style.visibility = 'hidden';
            playBtn.style.opacity = '0';
        }
    }

    async selectInstance(instance) {
        try {
            if (!this.assetsHandler) {
                console.error('❌ assetsHandler no está inicializado');
                return;
            }

            this.currentSelectedInstance = instance;

            const configClient = await this.db.readData('configClient');
            configClient.instance_select = instance.name;
            await this.db.updateData('configClient', configClient);

            await this.assetsHandler.updateInstanceBackground(instance);

            this.showPlayButton();

            if (this.rpc) {
                this.rpc.updateForInstance(instance.name);
            }
        } catch (error) {
            console.error('❌ Error al seleccionar instancia:', error);
        }
    }

    async loadInstanceAssets() {
        console.log('📦 Cargando assets de instancias...');

        try {
            const configClient = await this.db.readData('configClient');
            const auth = await this.db.readData('accounts', configClient.account_selected);
            const instancesList = await config.getInstanceList();

            const userAccess = await this.getUserAccessCodes(auth?.name);

            const existingContainer = document.querySelector('.sidebar-logos');
            if (existingContainer) {
                existingContainer.remove();
            }

            const sidebarLogoContainer = document.createElement('div');
            sidebarLogoContainer.classList.add('sidebar-logos');

            const addInstanceBtn = this.createAddInstanceButton();
            sidebarLogoContainer.appendChild(addInstanceBtn);

            const sidebar = document.querySelector('.sidebar');
            const playerOptions = document.querySelector('.player-options');

            if (!sidebar || !playerOptions) {
                console.error('❌ No se encontró sidebar o playerOptions');
                return;
            }

            sidebar.insertBefore(sidebarLogoContainer, playerOptions);

            this.assetsHandler.setWelcomeBackground();

            let instancesLoaded = 0;

            for (let instance of instancesList) {
                const hasAccess = this.checkInstanceAccess(instance, auth?.name, userAccess);

                if (hasAccess) {
                    try {
                        const logoElement = await this.assetsHandler.createLogoElement(
                            instance,
                            (selectedInstance) => {
                                this.selectInstance(selectedInstance);
                            },
                            auth?.name
                        );

                        sidebarLogoContainer.appendChild(logoElement);
                        instancesLoaded++;
                    } catch (logoError) {
                        console.error(`Error creando logo para ${instance.name}:`, logoError);
                    }
                }
            }

            console.log(`✅ ${instancesLoaded} instancias cargadas`);

            const savedInstanceName = configClient.instance_select;
            if (savedInstanceName) {
                const instanceToRestore = instancesList.find(i => i.name === savedInstanceName);

                if (instanceToRestore && this.checkInstanceAccess(instanceToRestore, auth?.name, userAccess)) {
                    await this.selectInstance(instanceToRestore);
                } else {
                    this.currentSelectedInstance = null;
                    this.hidePlayButton();
                }
            } else {
                this.currentSelectedInstance = null;
                this.hidePlayButton();
            }

        } catch (error) {
            console.error('❌ Error en loadInstanceAssets:', error);
        }
    }

    async reloadInstances() {
        try {
            const sidebarLogos = document.querySelector('.sidebar-logos');
            if (sidebarLogos) {
                sidebarLogos.remove();
            }

            this.currentSelectedInstance = null;
            this.hidePlayButton();

            await new Promise(resolve => setTimeout(resolve, 150));

            await this.loadInstanceAssets();
        } catch (error) {
            console.error('❌ Error en reloadInstances:', error);
        }
    }

    checkInstanceAccess(instance, username, userAccessCodes) {
        if (!instance.whitelistActive) return true;
        if (instance.whitelist && instance.whitelist.includes(username)) return true;
        if (userAccessCodes && userAccessCodes.includes(instance.name)) return true;
        return false;
    }

    createAddInstanceButton() {
        const addBtn = document.createElement('div');
        addBtn.classList.add('add-instance-btn');
        addBtn.title = 'Agregar instancia con código';
        addBtn.addEventListener('click', () => this.openInstanceCodeModal());
        return addBtn;
    }

    setupInstanceCodeModal() {
        if (!document.querySelector('.instance-code-modal')) {
            const modal = document.createElement('div');
            modal.classList.add('instance-code-modal');
            modal.innerHTML = `
                <div class="modal-content">
                    <h2 class="modal-title">Agregar Instancia</h2>
                    <p style="margin-bottom: 15px; font-size: 0.9rem; opacity: 0.8;">Ingresa el código proporcionado por el administrador.</p>
                    <input type="text" class="modal-input" placeholder="Código de acceso" maxlength="64">
                    <div class="modal-buttons">
                        <button class="modal-btn modal-btn-secondary" id="cancel-code">Cancelar</button>
                        <button class="modal-btn modal-btn-primary" id="submit-code">Validar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById('cancel-code').addEventListener('click', () => this.closeInstanceCodeModal());
            document.getElementById('submit-code').addEventListener('click', async () => await this.submitInstanceCode());

            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('instance-code-modal')) this.closeInstanceCodeModal();
            });

            modal.querySelector('.modal-input').addEventListener('keypress', async (e) => {
                if (e.key === 'Enter') await this.submitInstanceCode();
            });
        }
    }

    openInstanceCodeModal() {
        const modal = document.querySelector('.instance-code-modal');
        const input = modal.querySelector('.modal-input');
        modal.classList.add('active');
        input.value = '';
        input.focus();
    }

    closeInstanceCodeModal() {
        document.querySelector('.instance-code-modal').classList.remove('active');
    }

    async submitInstanceCode() {
        const input = document.querySelector('.instance-code-modal .modal-input');
        const code = input.value.trim();
        const btn = document.getElementById('submit-code');
        const API_URL = 'https://launchertest.pablorelojerio.online/files/validate_code.php';

        if (!code) return;

        const originalText = btn.innerText;
        btn.innerText = "Verificando...";
        btn.disabled = true;

        try {
            const configClient = await this.db.readData('configClient');
            const auth = await this.db.readData('accounts', configClient.account_selected);
            const timestamp = Math.floor(Date.now() / 1000);
            const dataToSign = {
                code: code,
                username: auth?.name,
                timestamp: timestamp
            };

            const crypto = require('crypto');
            const HMAC_SECRET = 'f2e1d0c9b8a7z6y5x4w3v2u1t0s9r8q7p6o5n4m3l2k1j0i9h8g7f6e5d4c3b2a1';
            const signature = crypto.createHmac('sha256', HMAC_SECRET)
                .update(JSON.stringify(dataToSign))
                .digest('hex');

            const response = await fetch(`${API_URL}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: code,
                    username: auth?.name,
                    timestamp: timestamp,
                    signature: signature
                })
            });

            const result = await response.json();

            if (result.success) {
                await this.saveUserAccessCode(auth?.name, result.instance);
                await new Promise(resolve => setTimeout(resolve, 500));
                this.closeInstanceCodeModal();
                await this.reloadInstances();

                const instancesList = await config.getInstanceList();
                const newInstance = instancesList.find(i => i.name === result.instance);
                if (newInstance) await this.selectInstance(newInstance);

                new popup().openPopup({
                    title: '¡Acceso Concedido!',
                    content: `Has desbloqueado la instancia: ${result.instanceDisplay || result.instance}`,
                    color: 'green',
                    options: true
                });

            } else {
                throw new Error(result.message || 'Código inválido');
            }

        } catch (error) {
            console.error('❌ Error validando código:', error);
            new popup().openPopup({
                title: 'Error',
                content: error.message || 'No se pudo conectar con el servidor.',
                color: 'red',
                options: true
            });
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }

    async saveUserAccessCode(username, instanceName) {
        try {
            const storageKey = 'userAccessCodes';
            let accessCodes = {};
            try {
                const stored = localStorage.getItem(storageKey);
                if (stored) accessCodes = JSON.parse(stored);
            } catch (e) { accessCodes = {}; }

            if (!Array.isArray(accessCodes[username])) accessCodes[username] = [];
            if (!accessCodes[username].includes(instanceName)) accessCodes[username].push(instanceName);

            localStorage.setItem(storageKey, JSON.stringify(accessCodes));
        } catch (error) {
            console.error('❌ Error en saveUserAccessCode:', error);
        }
    }

    async getUserAccessCodes(username) {
        let codes = [];
        try {
            const stored = localStorage.getItem('userAccessCodes');
            if (stored) {
                const accessCodes = JSON.parse(stored);
                if (accessCodes[username] && Array.isArray(accessCodes[username])) {
                    codes = [...accessCodes[username]];
                }
            }
        } catch (e) {
            console.warn('Error leyendo códigos de acceso');
        }
        return codes;
    }



    socialLick() {
        let socials = document.querySelectorAll('.social-block')

        socials.forEach(social => {
            social.addEventListener('click', e => {
                shell.openExternal(e.target.dataset.url)
            })
        });
    }

    async instancesSelect() {
        try {
            const elements = { instanceBTN: document.querySelector('.play-instance') };
            const configClient = await this.db.readData('configClient');
            const auth = await this.db.readData('accounts', configClient.account_selected);

            if (this.playButtonHandler) {
                elements.instanceBTN.removeEventListener('click', this.playButtonHandler);
            }

            this.playButtonHandler = async () => {
                if (this.isGameLaunching) {
                    console.log('⚠️ Ya hay un juego iniciándose...');
                    return;
                }

                let currentInstance = this.currentSelectedInstance;
                if (!currentInstance) {
                    const instancesList = await config.getInstanceList();
                    const configClient = await this.db.readData('configClient');
                    currentInstance = instancesList.find(i => i.name === configClient.instance_select);
                }

                if (!currentInstance) {
                    new popup().openPopup({ title: 'Selecciona una instancia', content: 'Debes seleccionar una instancia antes de jugar.', color: 'orange', options: true });
                    return;
                }

                const userAccess = await this.getUserAccessCodes(auth?.name);
                if (!this.checkInstanceAccess(currentInstance, auth?.name, userAccess)) {
                    new popup().openPopup({ title: 'Acceso Denegado', content: 'No tienes permiso para jugar esta instancia.', color: 'red', options: true });
                    return;
                }

                try {
                    await this.startGame();
                } catch (error) {
                    console.error('Error starting game:', error);
                    this.isGameLaunching = false;
                }
            };

            elements.instanceBTN.addEventListener('click', this.playButtonHandler);
        } catch (error) {
            console.error('Error in instancesSelect:', error);
        }
    }

    async startGame() {
        console.log("🎮 Iniciando Minecraft...");
        this.isGameLaunching = true;

        try {
            let launch = new Launch()
            let configClient = await this.db.readData('configClient')
            let instance = await config.getInstanceList()
            let authenticator = await this.db.readData('accounts', configClient.account_selected)

            if (!authenticator) throw new Error("No hay una cuenta seleccionada válida.");

            let options = instance.find(i => i.name == configClient.instance_select);
            if (!options) options = this.currentSelectedInstance;
            if (!options) throw new Error("No se pudo encontrar la configuración de la instancia seleccionada.");

            let playInstanceBTN = document.querySelector('.play-instance')
            let infoStartingBOX = document.querySelector('.info-starting-game')
            let infoStarting = document.querySelector(".info-starting-game-text")
            let progressBar = document.querySelector('.progress-bar')

            let opt = {
                url: options.url,
                authenticator: authenticator,
                timeout: 10000,
                path: `${await appdata()}/${process.platform == 'darwin' ? this.config.dataDirectory : `.${this.config.dataDirectory}`}`,
                instance: options.name,
                version: options.loadder.minecraft_version,
                detached: configClient.launcher_config.closeLauncher == "close-all" ? false : true,
                downloadFileMultiple: configClient.launcher_config.download_multi,
                intelEnabledMac: configClient.launcher_config.intelEnabledMac,

                loader: {
                    type: options.loadder.loadder_type,
                    build: options.loadder.loadder_version,
                    enable: options.loadder.loadder_type == 'none' ? false : true
                },

                verify: options.verify,

                ignored: options.ignored ? [...options.ignored] : [], // Fix: options.ignored check

                java: {
                    path: configClient.java_config.java_path,
                },

                JVM_ARGS: options.jvm_args ? options.jvm_args : [],
                GAME_ARGS: options.game_args ? options.game_args : [],

                screen: {
                    width: configClient.game_config.screen_size.width,
                    height: configClient.game_config.screen_size.height
                },

                memory: {
                    min: `${configClient.java_config.java_memory.min * 1024}M`,
                    max: `${configClient.java_config.java_memory.max * 1024}M`
                }
            }

            launch.Launch(opt);

            this.hidePlayButton();

            if (infoStartingBOX) infoStartingBOX.style.display = "block";
            if (progressBar) progressBar.style.display = "block";

            if (!document.querySelector('.download-stats') && infoStartingBOX) {
                const downloadStats = document.createElement('div')
                downloadStats.classList.add('download-stats')
                downloadStats.innerHTML = `<div class="download-speed">0 MB/s</div><div class="download-eta">...</div>`
                infoStartingBOX.insertBefore(downloadStats, progressBar)

                const percentageDisplay = document.createElement('div')
                percentageDisplay.classList.add('progress-percentage')
                percentageDisplay.textContent = '0%'

                const progressContainer = document.createElement('div')
                progressContainer.classList.add('progress-container')
                progressContainer.appendChild(progressBar)
                progressContainer.appendChild(percentageDisplay)

                infoStartingBOX.replaceChild(progressContainer, progressBar)

                const loadingAnimation = document.createElement('div')
                loadingAnimation.classList.add('loading-animation')
                loadingAnimation.innerHTML = '<span class="loading-dots"></span>'
                infoStartingBOX.appendChild(loadingAnimation)
            }

            const downloadSpeed = document.querySelector('.download-speed')
            const downloadETA = document.querySelector('.download-eta')
            const percentageDisplay = document.querySelector('.progress-percentage')
            const loadingAnimation = document.querySelector('.loading-animation')

            ipcRenderer.send('main-window-progress-load')

            launch.on('extract', extract => {
                ipcRenderer.send('main-window-progress-load')
                if (infoStarting) infoStarting.innerHTML = `Extrayendo archivos`
                if (percentageDisplay) percentageDisplay.textContent = 'Preparando...'
            });

            let lastProgressUpdate = Date.now();
            let lastBytesLoaded = 0;
            let averageSpeed = 0;
            let speedSamples = [];

            const calculateAverageSpeed = (newSpeed) => {
                speedSamples.push(newSpeed)
                if (speedSamples.length > 5) speedSamples.shift()
                return speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length
            }

            const formatTime = (seconds) => {
                if (seconds < 60) return `${Math.floor(seconds)}s`
                if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`
                return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
            }

            launch.on('progress', (progress, size) => {
                if (!isNaN(progress) && isFinite(progress) && !isNaN(size) && isFinite(size) && size > 0) {
                    const now = Date.now()
                    const elapsedSinceLastUpdate = (now - lastProgressUpdate) / 1000
                    if (elapsedSinceLastUpdate > 0.5) {
                        const bytesLoaded = progress - lastBytesLoaded
                        const instantSpeed = bytesLoaded / elapsedSinceLastUpdate
                        if (instantSpeed > 0) {
                            averageSpeed = calculateAverageSpeed(instantSpeed)
                            const speedMBps = (averageSpeed / 1048576).toFixed(2)
                            if (downloadSpeed) downloadSpeed.textContent = `${speedMBps} MB/s`
                            const remaining = size - progress
                            const eta = remaining / averageSpeed
                            if (eta > 0 && eta < 100000 && downloadETA) {
                                downloadETA.textContent = `Tiempo restante: ${formatTime(eta)}`
                            }
                        }
                        lastProgressUpdate = now
                        lastBytesLoaded = progress
                    }
                    const percent = ((progress / size) * 100).toFixed(0)
                    if (infoStarting) infoStarting.innerHTML = `Descargando archivos`
                    if (percentageDisplay) percentageDisplay.textContent = `${percent}%`
                    ipcRenderer.send('main-window-progress', { progress, size })
                    if (progressBar) {
                        progressBar.value = progress
                        progressBar.max = size
                    }
                }
                if (this.rpc) this.rpc.updateDownloadProgress(progress, size)
            });

            launch.on('check', (progress, size) => {
                if (infoStarting) infoStarting.innerHTML = `Verificando archivos`
                const percent = ((progress / size) * 100).toFixed(0)
                if (percentageDisplay) percentageDisplay.textContent = `${percent}%`
                ipcRenderer.send('main-window-progress', { progress, size })
                if (progressBar) {
                    progressBar.value = progress
                    progressBar.max = size
                }
                if (downloadSpeed) downloadSpeed.textContent = 'Verificando...'
                if (downloadETA) downloadETA.textContent = ''
            });

            launch.on('estimated', (time) => {
                let hours = Math.floor(time / 3600);
                let minutes = Math.floor((time - hours * 3600) / 60);
                let seconds = Math.floor(time - hours * 3600 - minutes * 60);
                console.log(`${hours}h ${minutes}m ${seconds}s`);
            })

            launch.on('speed', (speed) => {
                console.log(`${(speed / 1067008).toFixed(2)} Mb/s`)
            })

            launch.on('patch', patch => {
                ipcRenderer.send('main-window-progress-load')

                if (infoStarting) infoStarting.innerHTML = `<span class="game-running">Juego en curso</span>`
                if (loadingAnimation) loadingAnimation.style.display = "none"
                if (percentageDisplay) percentageDisplay.textContent = 'Iniciando...'
                if (downloadSpeed) downloadSpeed.textContent = ''
                if (downloadETA) downloadETA.textContent = ''
            });

            launch.on('data', (e) => {
                console.log(`[Minecraft] ${e}`);

                if (progressBar) progressBar.style.display = "none"
                if (loadingAnimation) loadingAnimation.style.display = "none"
                if (configClient.launcher_config.closeLauncher == 'close-launcher') ipcRenderer.send("main-window-hide");
                new logger('Minecraft', '#36b030');
                ipcRenderer.send('main-window-progress-load')
                if (infoStarting) infoStarting.innerHTML = `<span class="game-running">Juego en curso</span>`
                if (this.rpc) this.rpc.updateForInstance(options.name);
            })

            launch.on('close', code => {
                console.log(`🛑 Minecraft cerrado con código: ${code}`);
                this.isGameLaunching = false;

                if (configClient.launcher_config.closeLauncher == 'close-launcher') ipcRenderer.send("main-window-show");
                ipcRenderer.send('main-window-progress-reset')
                if (infoStartingBOX) infoStartingBOX.style.display = "none"
                this.showPlayButton();
                if (infoStarting) infoStarting.innerHTML = `Verificación`
                new logger(pkg.name, '#7289da');
                if (this.rpc) this.rpc.setDefault();
            });

            launch.on('error', err => {
                console.error("❌ Error del launcher:", err);
                this.isGameLaunching = false;

                let popupError = new popup()

                popupError.openPopup({
                    title: 'Error',
                    content: err.error || JSON.stringify(err),
                    color: 'red',
                    options: true
                })

                if (configClient.launcher_config.closeLauncher == 'close-launcher') ipcRenderer.send("main-window-show");
                ipcRenderer.send('main-window-progress-reset')
                if (infoStartingBOX) infoStartingBOX.style.display = "none"
                this.showPlayButton();
                if (infoStarting) infoStarting.innerHTML = `Verificación`
                new logger(pkg.name, '#7289da');
            });
        } catch (error) {
            console.error("❌ Excepción fatal en startGame:", error);
            throw error;
        }
    }

    getdate(e) {
        let date = new Date(e)
        let year = date.getFullYear()
        let month = date.getMonth() + 1
        let day = date.getDate()
        let allMonth = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
        return { year: year, month: allMonth[month - 1], day: day }
    }
}
export default Home;