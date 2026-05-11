const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Registro
router.post('/register', authController.register);

// Login
router.post('/login', authController.login);

// Logout
router.post('/logout', authController.logout);

// Recuperar Contraseña
router.post('/forgot-password', authController.forgotPassword);

module.exports = router;
