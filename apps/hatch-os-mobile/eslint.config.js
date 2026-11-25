const expo = require("eslint-config-expo/flat");

module.exports = [
  ...expo,
  {
    ignores: ["design/**", "dist/**", "web-build/**", ".expo/**", "ios/**", "android/**", "modules/**/ios/**"],
  },
];
