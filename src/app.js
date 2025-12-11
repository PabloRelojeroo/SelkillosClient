/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */

const { app, ipcMain, nativeTheme } = require('electron');
const { Microsoft } = require('minecraft-java-core');
const { autoUpdater } = require('electron-updater')

const path = require('path');
const fs = require('fs');
const os = require('os');

// =============================================================================
// PROTECCIÓN DE CONFIGURACIÓN
// =============================================================================
const APP_CONFIG_NAME = 'selvania-launcher';
if (process.env.NODE_ENV !== 'dev') {
    const userDataPath = path.join(os.homedir(), '.config', APP_CONFIG_NAME);
    if (fs.existsSync(userDataPath)) {
        const backupPath = path.join(os.homedir(), '.config', `${APP_CONFIG_NAME}-backup-` + Date.now());
        try {
            const criticalFiles = ['Preferences', 'Cookies', 'Network Persistent State', 'SingletonLock', 'SingletonCookie'];
            const dirs = ['databases', 'blob_storage', 'Cache', 'GPUCache'];
            fs.mkdirSync(backupPath, { recursive: true });

            criticalFiles.forEach(file => {
                const src = path.join(userDataPath, file);
                const dst = path.join(backupPath, file);
                if (fs.existsSync(src)) fs.copyFileSync(src, dst);
            });

            dirs.forEach(dir => {
                const src = path.join(userDataPath, dir);
                if (fs.existsSync(src)) {
                    const { execSync } = require('child_process');
                    execSync(`cp -r "${src}" "${backupPath}/"`, { stdio: 'ignore' });
                }
            });
            console.log(`✅ Backup creado en: ${backupPath}`);
        } catch (error) {
            console.error('❌ Error creando backup:', error.message);
        }
    }
}

const UpdateWindow = require("./assets/js/windows/updateWindow.js");
const MainWindow = require("./assets/js/windows/mainWindow.js");

let dev = process.env.NODE_ENV === 'dev';

if (dev) {
    let appPath = path.resolve('./data/Launcher').replace(/\\/g, '/');
    let appdata = path.resolve('./data').replace(/\\/g, '/');
    if (!fs.existsSync(appPath)) fs.mkdirSync(appPath, { recursive: true });
    if (!fs.existsSync(appdata)) fs.mkdirSync(appdata, { recursive: true });
    app.setPath('userData', appPath);
    app.setPath('appData', appdata)
}

if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(() => {
    if (dev) return MainWindow.createWindow()
    UpdateWindow.createWindow()

    // =============================================================================
    // RESTAURACIÓN AUTOMÁTICA EN MODO PRODUCCIÓN
    // =============================================================================
    if (!dev) {
        // ... (existing restore logic) ...
        const userDataPath = app.getPath('userData');
        const preferencesPath = path.join(userDataPath, 'Preferences');
        const hasOriginalData = fs.existsSync(preferencesPath) &&
            fs.readFileSync(preferencesPath, 'utf8').includes('original_timestamp');

        if (!hasOriginalData) {
            const backups = fs.readdirSync(path.join(os.homedir(), '.config'))
                .filter(name => name.startsWith(`${APP_CONFIG_NAME}-backup-`))
                .sort().reverse();

            if (backups.length > 0) {
                const latestBackup = path.join(os.homedir(), '.config', backups[0]);
                try {
                    const criticalFiles = ['Preferences', 'Cookies', 'Network Persistent State'];
                    criticalFiles.forEach(file => {
                        const src = path.join(latestBackup, file);
                        const dst = path.join(userDataPath, file);
                        if (fs.existsSync(src)) fs.copyFileSync(src, dst);
                    });

                    const dbSrc = path.join(latestBackup, 'databases');
                    const dbDst = path.join(userDataPath, 'databases');
                    if (fs.existsSync(dbSrc)) {
                        const { execSync } = require('child_process');
                        execSync(`rm -rf "${dbDst}" && cp -r "${dbSrc}" "${userDataPath}/"`, { stdio: 'ignore' });
                    }
                    console.log('✅ Configuración restaurada automáticamente desde backup');
                } catch (error) {
                    console.error('❌ Error restaurando desde backup:', error.message);
                }
            }
        }
    }
});

// Logic for transitioning from Splash (UpdateWindow) to Main
ipcMain.on('splash-check-finished', () => {
    const splashWin = UpdateWindow.getWindow();
    if (splashWin) {
        // 1. Resize Splash
        const { screen } = require('electron');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

        // Target size
        const targetW = 1280;
        const targetH = 720;

        // Animate resize
        splashWin.setSize(targetW, targetH, true);
        splashWin.center();

        // 2. Prepare Main Window (hidden)
        MainWindow.createWindow();
        const mainWin = MainWindow.getWindow();
        if (mainWin) {
            // Wait for resize animation approx time or signal?
            // We'll trust the timing or use a timeout
            setTimeout(() => {
                // Show Main Window
                mainWin.show();
                mainWin.focus();

                // 3. Fade out Splash (handled by renderer via CSS? or simple close?)
                // User asked for fade out. We can setOpacity loop here or ask renderer to fade body.
                // Let's ask renderer to fade body for better control
                splashWin.webContents.send('splash-fade-out');

                // Close after fade
                setTimeout(() => {
                    UpdateWindow.destroyWindow();
                }, 1000); // 1s fade time
            }, 800); // Wait for resize (approx .8s)
        }
    } else {
        // Fallback if splash gone
        MainWindow.createWindow();
    }
});


ipcMain.on('main-window-open', () => MainWindow.createWindow())
ipcMain.on('main-window-dev-tools', () => MainWindow.getWindow().webContents.openDevTools({ mode: 'detach' }))
ipcMain.on('main-window-dev-tools-close', () => MainWindow.getWindow().webContents.closeDevTools())
ipcMain.on('main-window-close', () => MainWindow.destroyWindow())
ipcMain.on('main-window-reload', () => MainWindow.getWindow().reload())
ipcMain.on('main-window-progress', (event, options) => MainWindow.getWindow().setProgressBar(options.progress / options.size))
ipcMain.on('main-window-progress-reset', () => MainWindow.getWindow().setProgressBar(-1))
ipcMain.on('main-window-progress-load', () => MainWindow.getWindow().setProgressBar(2))
ipcMain.on('main-window-minimize', () => MainWindow.getWindow().minimize())

// New Resize Handler
ipcMain.on('resize-window', (event, width, height) => {
    const win = MainWindow.getWindow();
    if (win) {
        win.setSize(width, height, true); // true = animate on mac/some linux
        win.center();
    }
});

ipcMain.on('update-window-close', () => UpdateWindow.destroyWindow())
ipcMain.on('update-window-dev-tools', () => UpdateWindow.getWindow().webContents.openDevTools({ mode: 'detach' }))
ipcMain.on('update-window-progress', (event, options) => UpdateWindow.getWindow().setProgressBar(options.progress / options.size))
ipcMain.on('update-window-progress-reset', () => UpdateWindow.getWindow().setProgressBar(-1))
ipcMain.on('update-window-progress-load', () => UpdateWindow.getWindow().setProgressBar(2))

ipcMain.handle('path-user-data', () => app.getPath('userData'))
ipcMain.handle('appData', e => app.getPath('appData'))

ipcMain.on('main-window-maximize', () => {
    if (MainWindow.getWindow().isMaximized()) {
        MainWindow.getWindow().unmaximize();
    } else {
        MainWindow.getWindow().maximize();
    }
})

ipcMain.on('main-window-hide', () => MainWindow.getWindow().hide())
ipcMain.on('main-window-show', () => MainWindow.getWindow().show())

ipcMain.handle('Microsoft-window', async (_, client_id) => {
    return await new Microsoft(client_id).getAuth();
})

ipcMain.handle('Microsoft-refresh', async (_, client_id, refresh_token) => {
    try {
        const microsoft = new Microsoft(client_id);
        const refreshedAuth = await microsoft.refresh(refresh_token);

        if (refreshedAuth && refreshedAuth.access_token) {
            return {
                access_token: refreshedAuth.access_token,
                refresh_token: refreshedAuth.refresh_token || refresh_token,
                expires_in: refreshedAuth.expires_in || 3600,
                uuid: refreshedAuth.uuid,
                name: refreshedAuth.name,
                profile: refreshedAuth.profile
            };
        } else {
            return { error: true, message: 'Token refresh falló' };
        }
    } catch (error) {
        console.error('[Microsoft Refresh Error]:', error);
        return { error: true, message: error.message };
    }
})

ipcMain.handle('is-dark-theme', (_, theme) => {
    if (theme === 'dark') return true
    if (theme === 'light') return false
    return nativeTheme.shouldUseDarkColors;
})

app.on('window-all-closed', () => app.quit());

autoUpdater.autoDownload = false;

ipcMain.handle('update-app', async () => {
    return await new Promise(async (resolve, reject) => {
        autoUpdater.checkForUpdates().then(res => {
            resolve(res);
        }).catch(error => {
            reject({
                error: true,
                message: error
            })
        })
    })
})

autoUpdater.on('update-available', () => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('updateAvailable');
});

ipcMain.on('start-update', () => {
    autoUpdater.downloadUpdate();
})

autoUpdater.on('update-not-available', () => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('update-not-available');
});

autoUpdater.on('update-downloaded', () => {
    autoUpdater.quitAndInstall();
});

autoUpdater.on('download-progress', (progress) => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('download-progress', progress);
})

autoUpdater.on('error', (err) => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('error', err);
});