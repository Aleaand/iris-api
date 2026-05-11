const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const verificarToken = require('../middleware/authMiddleware');

// Intento de pago (Privado)
router.post('/create-intent', verificarToken, paymentController.createIntent);

// Webhook de Stripe (Publico)
router.post('/webhook', express.raw({ type: 'application/json' }), paymentController.handleWebhook);

module.exports = router;
