const { Client } = require('discord-rpc');
const clientId = '1334505672875835475';

class DiscordRPC {
    constructor() {
        this.client = new Client({ transport: 'ipc' });
        this.startTimestamp = null;
        this.isConnected = false;
        this.connectionAttempts = 0;
        this.maxRetries = 3;
    }

    async init() {
        try {
            await this.client.login({ clientId });
            this.isConnected = true;
            this.startTimestamp = Date.now();
            await this.setDefault();
            console.log('✅ Discord RPC conectado');
        } catch (error) {
            this.isConnected = false;
            // No mostrar error si Discord no está corriendo (comportamiento esperado)
            if (error.message && !error.message.includes('ENOENT') && !error.message.includes('Could not connect')) {
                console.warn('⚠️ Discord RPC no disponible:', error.message);
            }
        }
    }

    async setDefault() {
        if (!this.isConnected) return;

        try {
            await this.client.setActivity({
                details: 'En el launcher',
                state: 'Seleccionando instancia',
                startTimestamp: this.startTimestamp,
                largeImageKey: 'minecraft_logo',
                largeImageText: 'Minecraft',
                instance: false
            });
        } catch (error) {
            this.handleError('setDefault', error);
        }
    }

    async updateForInstance(instanceName) {
        if (!this.isConnected) return;

        try {
            await this.client.setActivity({
                details: `Jugando ${instanceName}`,
                state: 'En el juego',
                startTimestamp: this.startTimestamp,
                largeImageKey: 'minecraft_logo',
                largeImageText: instanceName,
                instance: false
            });
        } catch (error) {
            this.handleError('updateForInstance', error);
        }
    }

    async updateDownloadProgress(progress, size) {
        if (!this.isConnected) return;

        const percent = ((progress / size) * 100).toFixed(0);
        try {
            await this.client.setActivity({
                details: 'Descargando archivos',
                state: `${percent}% completado`,
                startTimestamp: this.startTimestamp,
                largeImageKey: 'minecraft_logo',
                largeImageText: 'Descargando',
                instance: false
            });
        } catch (error) {
            this.handleError('updateDownloadProgress', error);
        }
    }

    handleError(method, error) {
        this.isConnected = false;
        // Solo loggear errores inesperados, no los de conexión
        if (error.message && !error.message.includes('RPC_CONNECTION_TIMEOUT')) {
            console.warn(`Discord RPC error en ${method}:`, error.message);
        }
    }

    async reconnect() {
        if (this.connectionAttempts >= this.maxRetries) {
            return;
        }

        this.connectionAttempts++;
        await new Promise(resolve => setTimeout(resolve, 5000 * this.connectionAttempts));
        await this.init();
    }

    destroy() {
        if (this.client && this.isConnected) {
            try {
                this.client.destroy();
                this.isConnected = false;
            } catch (error) {
                // Ignorar errores al destruir
            }
        }
    }
}

export default DiscordRPC;
