const chokidar = require("chokidar");
const fs = require("fs");
const path = require("path");
const get = require("lodash/get");
const set = require("lodash/set");
const vscode = require("vscode");
const { Range, Position, Hover } = vscode;

const workspaceRoot = vscode.workspace.rootPath;
const configurationSection = "i18nHelper";
const translation = {};
let globalWatcher;

function loadConfig() {
  return vscode.workspace.getConfiguration(configurationSection);
}

function getFolders(dir) {
  const realDir = path.join(workspaceRoot, dir);
  return new Promise((resolve, reject) => {
    fs.readdir(realDir, (err, folders) => {
      if (err) {
        reject(err);
      } else {
        resolve(folders.map(f => f));
      }
    });
  });
}

function loadFile(file) {
  return new Promise((resolve, reject) => {
    fs.readFile(file, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

async function loadProjects(configs) {
  const result = [];
  for (const config of configs) {
    result.push({
      name: config.name,
      locales: await getFolders(config.path)
    });
  }

  return result;
}

async function loadTranslation(config) {
  const { path, project, locale } = config;
  const fromFile = await loadFile(path);
  set(translation, [project, locale], JSON.parse(fromFile));
}

function initWatcher(projects) {
  const isWin = process.platform === "win32";
  const SEPERATOR = isWin ? "\\" : "/";
  const paths = projects.map(p => path.join(workspaceRoot, p.path));
  const watcher = chokidar.watch(paths, {
    persistent: true
  });

  const getTranslationConfig = path => {
    const _path = path.replace(`${workspaceRoot}${SEPERATOR}`, "");
    const project = projects.find(p => _path.startsWith(p.path));
    const pathRegex = isWin
      ? project.path.replace(/\\/g, "\\\\")
      : project.path.replace(/\//g, "\/");
    const fileRegex = isWin ? "\\\\translation.json" : "\/translation.json";
    const regex = `(?<=${pathRegex}).+(?=${fileRegex})`;
    const locale = _path.match(new RegExp(regex, "g")) || [""];

    return {
      path,
      project: project.name,
      locale: locale[0]
    };
  };

  const onEvent = async path => {
    const config = getTranslationConfig(path);
    await loadTranslation(config);
    console.log(`[i18n-helper] ${config.project} ${config.locale} loaded`);
  };

  watcher.on("add", onEvent).on("change", onEvent);

  globalWatcher = watcher;
  return watcher;
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

  console.log("[i18n-helper] is now active!");
  const projects = await loadProjects(config.projects);
  initWatcher(config.projects);

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

        // string in single quote
        const regex = /\'(.*?\..*?)\'/g;
        const match = wordInRange.match(regex);

        if (match && match.length) {
          const [str] = match;
          const target = str.replace(`'`, "").replace(`'`, "");
          const getter = config.flatten
            ? [target]
            : target.split(".");

          let markdownStr = "";

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
              projectStr += "|:--|:--|\n";
              projectStr += translationStr;
              projectStr += '\n'
            }

            markdownStr += projectStr;
          });

          if (markdownStr) {
            return new Hover(markdownStr);
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
function deactivate() {
  if (globalWatcher) {
    globalWatcher.close().then(() => console.log("watcher closed"));
  }
}

module.exports = {
  activate,
  deactivate
};
