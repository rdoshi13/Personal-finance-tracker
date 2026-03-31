const app = require('./app');
const { connectToDatabase } = require('./lib/mongo');

const PORT = process.env.PORT || 5001;

console.log('MongoDB URI configured:', Boolean(process.env.MONGO_URI));

connectToDatabase()
    .then(() => console.log('MongoDB connected'))
    .catch((error) => console.error('MongoDB connection error:', error));

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
