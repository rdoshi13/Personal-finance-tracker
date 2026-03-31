const mongoose = require('mongoose');

const globalCache = global;

if (!globalCache.__mongooseCache) {
    globalCache.__mongooseCache = {
        connection: null,
        promise: null,
    };
}

const cache = globalCache.__mongooseCache;

const connectToDatabase = async () => {
    if (cache.connection) {
        return cache.connection;
    }

    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not configured');
    }

    if (!cache.promise) {
        cache.promise = mongoose.connect(process.env.MONGO_URI).then((mongooseInstance) => mongooseInstance.connection);
    }

    try {
        cache.connection = await cache.promise;
        return cache.connection;
    } catch (error) {
        cache.promise = null;
        throw error;
    }
};

module.exports = {
    connectToDatabase,
};
