const de = require('./de.json');
const en = require('./en.json');

const LOCALES = { de, en };

function get(obj, keyPath) {
  return keyPath.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function t(lang, key, vars = {}) {
  const locale = LOCALES[lang] || LOCALES.de;
  let template = get(locale, key);
  if (template === undefined) template = get(LOCALES.de, key);
  if (template === undefined) return key;

  return Object.keys(vars).reduce((str, varKey) => str.split(`{{${varKey}}}`).join(vars[varKey]), template);
}

function isSupportedLanguage(lang) {
  return Object.prototype.hasOwnProperty.call(LOCALES, lang);
}

module.exports = { t, isSupportedLanguage, LOCALES };
