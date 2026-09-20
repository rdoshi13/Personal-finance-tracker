require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

/**
 * Brings a database's indexes in line with what the models declare.
 *
 * Mongoose builds indexes automatically on first use, but on Vercel that is a
 * background job on an instance that gets frozen as soon as the response is
 * sent, and any error it hits is swallowed. Production had silently been
 * missing two declared indexes because of this -- including the unique partial
 * index that stops a re-imported statement duplicating every row. Index state
 * is therefore not something to leave implicit; run this after any index change.
 *
 * Deliberately not Model.syncIndexes(): that drops anything undeclared without
 * asking, which has already cost us the de-dupe index once. This prints a plan,
 * and refuses to drop an index unless a surviving index still covers it.
 *
 * Pass --dry to see the plan without touching anything.
 */

/** True when `small`'s keys are a leading prefix of `big`'s, in order. */
const isPrefixOf = (small, big) => {
    const a = Object.entries(small);
    const b = Object.entries(big);
    if (a.length >= b.length) return false;
    return a.every(([field, dir], i) => b[i][0] === field && b[i][1] === dir);
};

const sameKeys = (a, b) => {
    const ea = Object.entries(a);
    const eb = Object.entries(b);
    return ea.length === eb.length
        && ea.every(([field, dir], i) => eb[i][0] === field && eb[i][1] === dir);
};

/** The options that change an index's identity, normalised for comparison. */
const identity = (options = {}) => JSON.stringify({
    unique: Boolean(options.unique),
    sparse: Boolean(options.sparse),
    expireAfterSeconds: options.expireAfterSeconds,
    partialFilterExpression: options.partialFilterExpression || null,
});

const describe = (keys) => `{ ${Object.entries(keys).map(([k, v]) => `${k}: ${v}`).join(', ')} }`;

const loadModels = () => {
    const dir = path.join(__dirname, '..', 'models');
    return fs.readdirSync(dir)
        .filter((file) => file.endsWith('.js'))
        .map((file) => require(path.join(dir, file)))
        .sort((a, b) => a.collection.collectionName.localeCompare(b.collection.collectionName));
};

const run = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not configured');
    }

    const dryRun = process.argv.includes('--dry');
    const models = loadModels();

    // autoIndex off: every build this script performs should be one it printed.
    await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
    const { host, name: dbName } = mongoose.connection;
    console.log(`${dryRun ? 'DRY RUN' : 'APPLY'} -- ${dbName} on ${host}\n`);

    let created = 0;
    let dropped = 0;
    let refused = 0;

    for (const Model of models) {
        const coll = Model.collection;
        console.log(`## ${coll.collectionName}`);

        let actual;
        try {
            actual = await coll.indexes();
        } catch (error) {
            // A collection that does not exist yet has no indexes to reconcile;
            // Mongoose will create it, and them, on first write.
            console.log(`   collection does not exist yet -- skipped\n`);
            continue;
        }

        const declared = Model.schema.indexes().map(([keys, options]) => ({ keys, options: options || {} }));

        // ---- missing ----------------------------------------------------
        for (const want of declared) {
            const match = actual.find((ix) => sameKeys(ix.key, want.keys));

            if (match && identity(match) !== identity(want.options)) {
                // Same keys, different options: Mongo will not silently replace
                // it, and dropping it here would be a judgement call this script
                // should not make on its own.
                console.log(`   CONFLICT ${match.name} ${describe(want.keys)}`);
                console.log(`            on server: ${identity(match)}`);
                console.log(`            declared : ${identity(want.options)}`);
                console.log(`            drop it by hand, then re-run`);
                refused += 1;
                continue;
            }

            if (match) continue;

            console.log(`   CREATE   ${describe(want.keys)} ${want.options.unique ? '(unique) ' : ''}`);
            if (!dryRun) {
                const name = await coll.createIndex(want.keys, want.options);
                console.log(`            built as ${name}`);
            }
            created += 1;
        }

        // ---- undeclared ---------------------------------------------------
        const keep = [...actual.filter((ix) => ix.name === '_id_').map((ix) => ix.key), ...declared.map((d) => d.keys)];
        for (const ix of actual) {
            if (ix.name === '_id_') continue;
            if (declared.some((want) => sameKeys(ix.key, want.keys))) continue;

            // Only drop what something else still covers. An undeclared index
            // nothing covers may exist for a reason not visible in the models.
            const covered = keep.find((keys) => isPrefixOf(ix.key, keys));
            if (!covered) {
                console.log(`   REFUSE   drop ${ix.name} ${describe(ix.key)} -- nothing declared covers it`);
                refused += 1;
                continue;
            }

            console.log(`   DROP     ${ix.name} ${describe(ix.key)} -- covered by ${describe(covered)}`);
            if (!dryRun) {
                await coll.dropIndex(ix.name);
                console.log('            dropped');
            }
            dropped += 1;
        }

        console.log('');
    }

    const verb = dryRun ? 'would be' : 'were';
    console.log(`${created} index(es) ${verb} created, ${dropped} ${verb} dropped, ${refused} need a decision.`);
    if (dryRun && (created || dropped)) {
        console.log('Re-run without --dry to apply.');
    }

    await mongoose.disconnect();
};

run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
