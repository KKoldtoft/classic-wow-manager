// index.js
const express = require('express');
const app = express();
// Heroku assigns a dynamic port, so use process.env.PORT
const PORT = process.env.PORT || 3000;

// Define a simple route
app.get('/', (req, res) => {
  res.send('Hello from Heroku! This is my Node.js app.');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});