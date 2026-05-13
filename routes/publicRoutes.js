const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');

// Vuelos
router.get('/flights', publicController.getFlights);
router.get('/flights/search', publicController.searchFlights);
router.get('/flights/:id', publicController.getFlightById);

// Destinos
router.get('/destinations', publicController.getDestinations);
router.get('/destinations/:slug', publicController.getDestinationBySlug);

// Hoteles 
router.get('/hotels', publicController.getHotels);
router.get('/hotels/:id', publicController.getHotelById);

// Logística
router.get('/terrestrial-flights', publicController.getTerrestrialFlights);

// Tarifas
router.get('/tariffs', publicController.getTariffs);

// Localizaciones
router.get('/locations', publicController.getLocations);

module.exports = router;
