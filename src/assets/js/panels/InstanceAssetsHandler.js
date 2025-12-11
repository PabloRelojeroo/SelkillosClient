/**
 * @author Pablo
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

class InstanceAssetsHandler {
    constructor() {
        this.baseUrl = 'https://launchertest.pablorelojerio.online//files';
        this.defaultAssets = {
            logo: 'assets/images/default/default-logo.png',
            background: 'assets/images/default/default-background.png',
            welcomeBackground: 'assets/images/default/welcome-background.jpg',
            icon: 'assets/images/icon.png'
        };
        this.addGlobalStyles();
    }

    buildAssetUrl(instanceName, assetPath) {
        if (!assetPath) return null;

        if (assetPath.startsWith('http://') || assetPath.startsWith('https://')) {
            return assetPath;
        }

        if (assetPath.startsWith('assets/')) {
            return assetPath;
        }

        return `${this.baseUrl}/${assetPath}`;
    }

    getInstanceAssets(instance) {
        const customization = instance.customization || {};

        const backgroundUrl = customization.background && typeof customization.background === 'string' ?
            this.buildAssetUrl(instance.name, customization.background) :
            this.defaultAssets.background;

        const logoUrl = customization.logo ?
            this.buildAssetUrl(instance.name, customization.logo) :
            this.defaultAssets.logo;

        return {
            logo: logoUrl,
            background: backgroundUrl
        };
    }

    addGlobalStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* Estilos incluidos en home.css mejorado */
        `;
        document.head.appendChild(style);
    }

    showWelcomePanel() {
        this.setWelcomeBackground();
    }

    hideWelcomePanel() {
        document.body.classList.remove('welcome-active');
    }

    setWelcomeBackground() {
        const backgroundUrl = this.defaultAssets.welcomeBackground;

        const img = new Image();
        img.onload = () => {
            // Aplicar con transición suave
            document.body.style.opacity = '0.8';
            setTimeout(() => {
                document.body.style.setProperty('background-image', `url('${backgroundUrl}')`, 'important');
                document.body.style.setProperty('background-size', 'cover', 'important');
                document.body.style.setProperty('background-position', 'center', 'important');
                document.body.style.setProperty('background-repeat', 'no-repeat', 'important');
                document.body.style.setProperty('background-color', 'rgba(0, 0, 0, 0.4)', 'important');
                document.body.style.setProperty('background-blend-mode', 'overlay', 'important');
                document.body.style.setProperty('transition', 'all 0.5s ease', 'important');
                document.body.style.opacity = '1';
            }, 200);
        };

        img.onerror = () => {
            document.body.style.setProperty('background-image', `url('${this.defaultAssets.background}')`, 'important');
        };

        img.src = backgroundUrl;
    }

    async createLogoElement(instance, onClick, username) {
        console.log(`🏗️ Creando elemento de logo para: ${instance.name}`);

        const container = document.createElement('div');
        container.classList.add('instance-logo-container');
        container.id = `logo-${instance.name}`;

        const img = document.createElement('img');
        img.classList.add('instance-logo');
        img.alt = instance.customization?.name_display || instance.name;
        img.loading = 'lazy';

        const { logo } = this.getInstanceAssets(instance);

        if (instance.customization?.name_display) {
            container.setAttribute('title', instance.customization.name_display);
        }

        img.onerror = () => {
            console.warn(`⚠️ Error al cargar el logo para ${instance.name}, usando logo por defecto`);
            img.src = this.defaultAssets.logo;
        };

        img.onload = () => {
            console.log(`✅ Logo cargado exitosamente para ${instance.name}`);
        };

        img.src = logo;
        container.appendChild(img);

        console.log(`✅ Contenedor creado con ID: ${container.id}`);

        if (onClick) {
            container.addEventListener('click', async () => {
                console.log(`🖱️ Click detectado en logo: ${instance.name}`);

                if (container.classList.contains('active-instance')) {
                    console.log('⚠️ Esta instancia ya está activa');
                    return;
                }

                const previousActive = document.querySelector('.active-instance');
                if (previousActive) {
                    previousActive.classList.remove('active-instance');
                }
                container.classList.add('active-instance');

                try {
                    this.hideWelcomePanel();
                    await this.updateInstanceBackground(instance);
                    onClick(instance);
                } catch (error) {
                    console.error('❌ Error al actualizar el fondo:', error);
                }
            });
        }

        return container;
    }

    async updateInstanceBackground(instance) {
        console.log('Actualizando fondo para instancia:', instance.name);

        return new Promise((resolve, reject) => {
            const { background } = this.getInstanceAssets(instance);
            console.log('URL del fondo:', background);

            const img = new Image();

            img.onload = () => {
                console.log('Imagen de fondo cargada exitosamente');

                // Transición suave con opacity
                document.body.style.opacity = '0.7';

                setTimeout(() => {
                    document.body.style.setProperty('background-image', `url('${background}')`, 'important');
                    document.body.style.setProperty('background-size', 'cover', 'important');
                    document.body.style.setProperty('background-position', 'center', 'important');
                    document.body.style.setProperty('background-repeat', 'no-repeat', 'important');
                    document.body.style.setProperty('background-blend-mode', 'normal', 'important');
                    document.body.style.setProperty('background-color', 'transparent', 'important');
                    document.body.style.setProperty('transition', 'all 0.5s ease', 'important');

                    // Fade in suave
                    setTimeout(() => {
                        document.body.style.opacity = '1';
                    }, 50);
                }, 300);

                resolve();
            };

            img.onerror = (error) => {
                console.warn(`Error al cargar el fondo para la instancia ${instance.name}:`, error);
                document.body.style.setProperty('background-image', `url('${this.defaultAssets.background}')`, 'important');
                document.body.style.opacity = '1';
                reject(error);
            };

            img.src = background;
        });
    }
}

export default InstanceAssetsHandler;
