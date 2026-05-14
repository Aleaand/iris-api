const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const verificarToken = require('../middleware/authMiddleware');

// Todas estas rutas requieren Token
router.use(verificarToken);

// Perfil
router.get('/', customerController.getMe);
router.put('/', customerController.updateMe);
router.delete('/', customerController.deleteAccount);
router.put('/password', customerController.updatePassword);
router.get('/manager', customerController.getManagerProfile);

// Reservas
router.get('/reservations', customerController.getReservations);
router.get('/reservations/:id', customerController.getReservationById);
router.post('/reservations', customerController.createReservation);
router.delete('/reservations/:id', customerController.cancelReservation);

// Pasajeros
router.get('/passengers', customerController.getPassengers);
router.post('/passengers', customerController.createPassenger);
router.put('/passengers/:id', customerController.updatePassenger);
router.delete('/passengers/:id', customerController.deletePassenger);

// Documentos
router.get('/documents', customerController.getDocuments);
router.get('/documents/:passengerId/passport', customerController.getPassport);

// Mensajes
router.get('/messages', customerController.getMessages);
router.post('/messages', customerController.sendMessage);
router.delete('/messages/:id', customerController.deleteMessage);

// Pagos (Historial)
router.get('/payments', customerController.getPayments);
router.get('/manager/availability', customerController.getManagerAvailability);

// Tareas (Gestión)
router.post('/tasks', customerController.createTask);

module.exports = router;
