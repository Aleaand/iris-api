const conexionBD = require('../config/db');

async function obtenerPrecioActual(tipoItem) {
    try {
        const consulta = 'SELECT new_price FROM price_logs WHERE item_type = $1 ORDER BY created_at DESC LIMIT 1';
        const resultado = await conexionBD.query(consulta, [tipoItem]);
        if (resultado.rowCount > 0) return parseFloat(resultado.rows[0].new_price);
        const valoresDefecto = {
            'training': 50000.0,
            'vip_transfer': 1000.0,
            'passport_management': 2500.0,
            'refund_insurance': 10.0,
            'crew_expense_per_au': 12.0
        };
        return valoresDefecto[tipoItem] || 0.0;
    } catch (error) {
        console.error('Error al obtener precio de ' + tipoItem, error);
        return 0.0;
    }
}

const publicController = {

    async getFlights(pedido, respuesta) {
        const { pagina = 1, limite = 10 } = pedido.query;
        const offset = (pagina - 1) * limite;
        try {
            const consulta = `
                SELECT f.*, s.name as starship_name, d.name as destination_name, o.name as origin_name
                FROM flights f
                JOIN starships s ON f.starship_id = s.id
                JOIN destinations d ON f.destination_id = d.id
                LEFT JOIN destinations o ON f.origin_id = o.id
                WHERE f.status != 'cancelled' 
                ORDER BY f.departure_date ASC
                LIMIT $1 OFFSET $2
            `;
            const resultado = await conexionBD.query(consulta, [limite, offset]);
            respuesta.json({ total: resultado.rowCount, pagina: parseInt(pagina), datos: resultado.rows });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener vuelos' });
        }
    },

    async getFlightById(pedido, respuesta) {
        const { id } = pedido.params;
        try {
            const consulta = 'SELECT * FROM flights WHERE id = $1';
            const resultado = await conexionBD.query(consulta, [id]);
            if (resultado.rowCount === 0) return respuesta.status(404).json({ mensaje: 'Vuelo no encontrado' });
            respuesta.json(resultado.rows[0]);
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener el detalle del vuelo' });
        }
    },

    async searchFlights(pedido, respuesta) {
        const { destination_id, departure_date_from, departure_date_to, seat_type, min_seats } = pedido.query;
        try {
            let consulta = `
                SELECT f.*, d.name as destination_name 
                FROM flights f
                JOIN destinations d ON f.destination_id = d.id
                WHERE f.status != 'cancelled'
            `;
            const parametros = [];
            let contador = 1;

            if (destination_id) {
                consulta += ` AND f.destination_id = $${contador++}`;
                parametros.push(destination_id);
            }
            if (departure_date_from) {
                consulta += ` AND f.departure_date >= $${contador++}`;
                parametros.push(departure_date_from);
            }
            if (departure_date_to) {
                consulta += ` AND f.departure_date <= $${contador++}`;
                parametros.push(departure_date_to);
            }
            if (min_seats) {
                consulta += ` AND (f.total_capacity - f.booked_passengers) >= $${contador++}`;
                parametros.push(min_seats);
            }

            consulta += ' ORDER BY f.departure_date ASC';
            const resultado = await conexionBD.query(consulta, parametros);
            respuesta.json({ total: resultado.rowCount, datos: resultado.rows });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error en la búsqueda de vuelos' });
        }
    },

    async getDestinations(pedido, respuesta) {
        try {
            const consulta = 'SELECT * FROM destinations ORDER BY name ASC';
            const resultado = await conexionBD.query(consulta);
            respuesta.json({ total: resultado.rowCount, datos: resultado.rows });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener destinos' });
        }
    },

    async getDestinationBySlug(pedido, respuesta) {
        const { slug } = pedido.params;
        try {
            const consulta = 'SELECT * FROM destinations WHERE LOWER(name) = $1';
            const resultado = await conexionBD.query(consulta, [slug.toLowerCase()]);
            if (resultado.rowCount === 0) return respuesta.status(404).json({ mensaje: 'Destino no encontrado' });
            respuesta.json(resultado.rows[0]);
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener el destino' });
        }
    },

    async getHotels(pedido, respuesta) {
        try {
            const consulta = 'SELECT h.*, l.name as location_name FROM hotels h JOIN locations l ON h.location_id = l.id ORDER BY h.name ASC';
            const resultado = await conexionBD.query(consulta);
            respuesta.json({ total: resultado.rowCount, datos: resultado.rows });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener hoteles' });
        }
    },

    async getHotelById(pedido, respuesta) {
        const { id } = pedido.params;
        try {
            const consulta = 'SELECT h.*, l.name as location_name FROM hotels h JOIN locations l ON h.location_id = l.id WHERE h.id = $1';
            const resultado = await conexionBD.query(consulta, [id]);
            if (resultado.rowCount === 0) return respuesta.status(404).json({ mensaje: 'Hotel no encontrado' });
            respuesta.json(resultado.rows[0]);
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener el detalle del hotel' });
        }
    },

    async getTerrestrialFlights(pedido, respuesta) {
        try {
            const consulta = 'SELECT * FROM terrestrial_flights ORDER BY departure_datetime ASC';
            const resultado = await conexionBD.query(consulta);
            respuesta.json({ total: resultado.rowCount, datos: resultado.rows });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener vuelos terrestres' });
        }
    },

    async getTariffs(pedido, respuesta) {
        try {
            const tarifas = {
                training: await obtenerPrecioActual('training'),
                vip_transfer: await obtenerPrecioActual('vip_transfer'),
                passport_management: await obtenerPrecioActual('passport_management'),
                refund_insurance_pct: await obtenerPrecioActual('refund_insurance')
            };
            respuesta.json(tarifas);
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al obtener tarifas' });
        }
    }
};

module.exports = publicController;
