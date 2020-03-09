const vscode = require('vscode');
const get = require('lodash/get');
const set = require('lodash/set');
const fs = require('fs');
const path = require('path');
const { Range, Position, Hover } = vscode;
const workspaceRoot = vscode.workspace.rootPath;
const configurationSection = 'i18nHelper';

function loadConfig() {
  const config = vscode.workspace.getConfiguration(configurationSection);
  return config
}

function getFolders(dir){
  const realDir = path.join(workspaceRoot, dir);
  return new Promise((resolve, reject) => {
    fs.readdir(realDir, (err, folders) => {
      if (err) {
        reject(err);
      } else {
        resolve(
          folders.map((f) => f)
        );
      }
    });
  });
}

function loadFile(file) {
  return new Promise((resolve, reject) => {
    fs.readFile(file, (err, data) => {      
      if(err){
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

async function getProjects(configs) {
  const result = [];
  for (const config of configs){
    result.push({
      name: config.name,
      locales: await getFolders(config.path)
    })
  }
  return result;
}

async function loadTranslations(projects) {
  const result = {};

  for (const project of projects) {
    console.log(`--- Project ${project.name} ---`);
    const locales = await getFolders(project.path);

    for (const locale of locales) {
      const filePath = path.join(
        workspaceRoot,
        project.path,
        locale,
        "translation.json"
      );
      const fromFile = await loadFile(filePath);
      set(result, [project.name, locale], JSON.parse(fromFile));
      console.log(`${locale} loaded`);
    }
    console.log('-----');
  }

  return result;
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate() {
  const config = loadConfig();

  if (!config.projects) {
    const toast = "`i18nHelper.projects` not found!";
    vscode.window.showInformationMessage(toast);
    return;
  }
  console.log("i18n-helper is now active!");

  const projects = await getProjects(config.projects);
  const translation = await loadTranslations(config.projects);

  vscode.languages.registerHoverProvider(
    ["javascript", "javascriptreact"],
    {
      provideHover(document, position) {
        const { activeTextEditor } = vscode.window;

        // If there's no activeTextEditor, do nothing.
        if (!activeTextEditor) {
          return;
        }

        const { line, character } = position;

        const start = new Position(
          line,
          character - 50 < 0 ? 0 : character - 50
        );
        const end = new Position(line, character + 50);
        const biggerRange = new Range(start, end);
        const wordInRange = document.getText(biggerRange);

        // string in single quote, and contain dot
        const regex = /\'(.*?\..*?)\'/g;
        const match = wordInRange.match(regex);

        if (match && match.length) {
          const [str] = match;
          const target = str.replace(`'`, "").replace(`'`, "");
          const getter = config.flatten
            ? target.split(".")
            : [target];
          let mdStr = "";

          projects.forEach(project => {
            const { name, locales } = project;
            let projectStr = "";
            let translationStr = "";
            locales.forEach(locale => {
              const t = get(translation, [name, locale, ...getter]);
              if (t) {
                translationStr += `|${locale}|${t}|\n`;
              }
            });

            if (translationStr.length) {
              projectStr += `|${name}||\n`;
              projectStr += "|:---|:---|\n";
              projectStr += translationStr;
            }

            mdStr += projectStr;
          });

          if(mdStr){
            return new Hover(mdStr);
          } else {
            return;
          }
        }
      }
    }
  );
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
