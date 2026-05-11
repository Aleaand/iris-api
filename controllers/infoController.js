const conexionBD = require('../config/db');

const infoController = {

    async submitContact(pedido, respuesta) {
        const { nombre, email, mensaje, asunto } = pedido.body;
        try {
            console.log(`Nuevo mensaje de contacto de ${nombre} (${email}): ${mensaje}`);

            respuesta.json({
                mensaje: 'Gracias por contactar con Iris Aerospace. Te responderemos pronto.'
            });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error al procesar el contacto' });
        }
    },
    async subscribeNewsletter(pedido, respuesta) {
        const { email } = pedido.body;
        try {
            console.log(`Nueva suscripción al boletín: ${email}`);

            respuesta.json({
                mensaje: 'Te has suscrito con éxito al boletín de noticias espaciales.'
            });
        } catch (error) {
            console.error(error);
            respuesta.status(500).json({ mensaje: 'Error en la suscripción' });
        }
    }
};

module.exports = infoController;
