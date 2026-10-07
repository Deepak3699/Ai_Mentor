module.exports = {
  '*.{js,jsx}': () => 'npm run lint',
  '*.{js,jsx,ts,tsx,py}': () => 'npm run test',
};
