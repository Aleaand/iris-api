const express = require('express');
const router = express.Router();
const infoController = require('../controllers/infoController');

// Contacto
router.post('/contact', infoController.submitContact);
router.post('/newsletter/subscribe', infoController.subscribeNewsletter);

module.exports = router;
