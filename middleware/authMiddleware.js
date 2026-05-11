const jwt = require('jsonwebtoken');

const verificarToken = (pedido, respuesta, siguiente) => {
    // Token del encabezado Authorization (Bearer TOKEN)
    const authHeader = pedido.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return respuesta.status(401).json({ mensaje: 'Acceso denegado. No se encontró token de autenticación.' });
    }

    try {
        const verificado = jwt.verify(token, process.env.JWT_SECRET || 'iris_secreto_espacial');
        pedido.usuario = verificado;
        siguiente();
    } catch (error) {
        respuesta.status(403).json({ mensaje: 'Token inválido o expirado.' });
    }
};

module.exports = verificarToken;
