const electron = require('electron')
const {ipcMain} = require('electron')
const app = electron.app
const BrowserWindow = electron.BrowserWindow
const path = require('path')
const url = require('url')
const shell = require('electron').shell;
const Menu = require('electron').Menu

let mainWindow
function createWindow () {
  mainWindow = new BrowserWindow({
    show: false, 
    width: 1024, 
    height: 768,
    minWidth: 1024,
    minHeight: 768,
    frame: true, 
    title: "BakeChain",
    useContentSize: true, 
    icon : path.join(__dirname, 'assets/desktop-icon.png'),
    webPreferences: {
      devTools: true
    }
  })
  mainWindow.webContents.on('new-window', function(event, url){
    event.preventDefault();
    shell.openExternal(url);
  });
  
  splash = new BrowserWindow({
    width: 400, 
    height: 300, 
    transparent : true,
    frame: false, 
    alwaysOnTop: true,
    icon : path.join(__dirname, 'assets/desktop-icon.png')
  });
  splash.loadURL(url.format({
    pathname: path.join(__dirname, 'app/splash.html'),
    protocol: 'file:',
    slashes: true
  }));
  
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'app/index.html'),
    protocol: 'file:',
    slashes: true
  }))
  mainWindow.webContents.on('did-finish-load', function(){
    splash.destroy();
    mainWindow.show();
    mainWindow.focus();
  });
  mainWindow.on('closed', function () {
    mainWindow = null
  })
}
function createMenu() {
  const application = {
    label: "BakeChain",
    submenu: [
      {
        label: "Quit",
        accelerator: "CmdOrCtrl+Q",
        click: () => {
          app.quit()
        }
      }
    ]
  }

  const edit = {
    label: "Edit",
    submenu: [
      {
        label: "Copy",
        accelerator: "CmdOrCtrl+C",
        selector: "copy:"
      },
      {
        label: "Paste",
        accelerator: "CmdOrCtrl+V",
        selector: "paste:"
      }
    ]
  }

  const template = [
    application,
    edit
  ]

  //Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
app.on('ready',function(){
  createWindow();
  createMenu();
});
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