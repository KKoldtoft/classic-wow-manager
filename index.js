// index.js
require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const session = require('express-session'); // For session management
const passport = require('passport'); // For authentication
const DiscordStrategy = require('passport-discord').Strategy; // Discord OAuth strategy
const { Pool } = require('pg'); // For PostgreSQL database

const app = express();
const PORT = process.env.PORT || 3000;

// --- Database Configuration ---
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

let dbConnectionStatus = 'Connecting...';

pool.connect()
  .then(client => {
    console.log('Connected to PostgreSQL database!');
    dbConnectionStatus = 'Connected';
    client.release();
  })
  .catch(err => {
    console.error('Error connecting to PostgreSQL database:', err.stack);
    dbConnectionStatus = 'Failed to Connect';
  });

// --- Session Configuration ---
app.use(session({
  secret: process.env.SESSION_SECRET, // Use a strong, random string from .env
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 60 * 60 * 1000, // 1 hour
    secure: process.env.NODE_ENV === 'production' // Use secure cookies in production (HTTPS)
  }
}));

// --- Passport.js Configuration ---
app.use(passport.initialize());
app.use(passport.session());

// Passport serialization and deserialization
// This determines what user data is stored in the session
passport.serializeUser((user, done) => {
  done(null, user); // Store the entire user object in the session
});

passport.deserializeUser((obj, done) => {
  done(null, obj); // Retrieve the user object from the session
});

// Discord OAuth2 Strategy
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: `${process.env.APP_BASE_URL}/auth/discord/callback`, // Use APP_BASE_URL
    scope: ['identify', 'email'] // Request user ID, username, avatar, and email
},
(accessToken, refreshToken, profile, done) => {
    // This function is called when a user successfully authenticates with Discord.
    // You can save/update user data in your database here.
    // For now, we'll just pass the Discord profile directly.
    // The 'profile' object contains user data from Discord.
    return done(null, profile);
}));

// --- Express Routes ---

// Serve static files (for CSS and potentially other frontend assets)
app.use(express.static('public'));

// Root route - serves the main HTML page
app.get('/', (req, res) => {
  // This will be replaced by serving an actual HTML file in Step 5
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Classic WoW Manager</title>
        <link rel="stylesheet" href="/style.css">
        <!-- Font Awesome for Discord icon -->
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
    </head>
    <body>
        <div class="top-bar">
            <div class="app-title">Classic WoW Manager</div>
            <div id="auth-container">
                <!-- Login button or user avatar will be injected here by JavaScript -->
            </div>
        </div>

        <div class="content">
            <h1>Hello from Heroku!</h1>
            <p>This is my Node.js app with database support.</p>
            <p>Database Status: <strong>${dbConnectionStatus}</strong></p>
            <p>Visit <a href="/db-test">/db-test</a> to confirm database query.</p>
        </div>

        <script src="/script.js"></script>
    </body>
    </html>
  `);
});

// Discord OAuth routes
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
  passport.authenticate('discord', {
    failureRedirect: '/' // Redirect on failure
  }),
  (req, res) => {
    // Successful authentication, redirect home or to a dashboard
    res.redirect('/');
  }
);

// Logout route
app.get('/auth/logout', (req, res, next) => {
  req.logout((err) => { // Passport's logout method
    if (err) { return next(err); }
    res.redirect('/'); // Redirect to home after logout
  });
});

// Endpoint to get user data (for frontend)
app.get('/user', (req, res) => {
  if (req.isAuthenticated()) {
    // req.user is populated by passport.deserializeUser
    res.json({
      loggedIn: true,
      id: req.user.id,
      username: req.user.username,
      discriminator: req.user.discriminator,
      avatar: req.user.avatar,
      email: req.user.email // Only if 'email' scope was requested
    });
  } else {
    res.json({ loggedIn: false });
  }
});

// Existing route to test database connection and fetch data
app.get('/db-test', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');
    client.release();

    res.json({
      message: 'Database connection successful!',
      currentTime: result.rows[0].current_time
    });
  } catch (err) {
    console.error('Error executing query:', err.stack);
    res.status(500).json({
        message: 'Error connecting to or querying the database.',
        error: err.message
    });
  }
});

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// --- Graceful Shutdown ---
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  pool.end(() => {
    console.log('Database pool has ended.');
    process.exit(0);
  });
});