const electron = require('electron')
const {ipcMain} = require('electron')
const app = electron.app
const BrowserWindow = electron.BrowserWindow
const keytar = require('keytar');
const path = require('path')
const url = require('url')
const shell = require('electron').shell;

let mainWindow
function createWindow () {
  mainWindow = new BrowserWindow({width: 970, height: 748, frame: true, useContentSize: true, icon : path.join(__dirname, 'app/icon.png'),webPreferences: {
    devTools: false
}})
mainWindow.webContents.on('new-window', function(event, url){
  event.preventDefault();
  shell.openExternal(url);
});
mainWindow.setMenu(null);
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'app/index.html'),
    protocol: 'file:',
    slashes: true
  }))
  mainWindow.on('closed', function () {
    mainWindow = null
  })
}
app.on('ready', createWindow)
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow()
  }
})