const express = require('express');

function keepAlive() {
  const app = express();
  app.get('/', (req, res) => res.send('LochabAnime bot is alive ✅'));
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`🌐 Keep-alive server on port ${port}`));
}

module.exports = keepAlive;
