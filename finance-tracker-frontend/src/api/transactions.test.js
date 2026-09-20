import { getTransactions, getTransactionsPage } from './transactions';

const page = (transactions, nextCursor = null) => ({
    transactions,
    hasMore: Boolean(nextCursor),
    nextCursor,
});

const respondWith = (...pages) => {
    global.fetch = jest.fn(() => {
        const body = pages.shift();
        return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    });
};

const calledUrls = () => global.fetch.mock.calls.map(([url]) => url);
const row = (id) => ({ _id: id, name: `Row ${id}`, amount: 1 });

afterEach(() => { delete global.fetch; });

describe('getTransactionsPage', () => {
    test('asks for a bounded page and passes the cursor through', async () => {
        respondWith(page([row('a')]));

        await getTransactionsPage({ limit: 10, cursor: 'abc' });

        const url = calledUrls()[0];
        expect(url).toContain('limit=10');
        expect(url).toContain('cursor=abc');
    });

    test('omits the cursor on the first page', async () => {
        respondWith(page([row('a')]));

        await getTransactionsPage();

        expect(calledUrls()[0]).not.toContain('cursor=');
    });
});

describe('getTransactions', () => {
    test('walks every page and returns one flat list in order', async () => {
        respondWith(
            page([row('a'), row('b')], 'cursor-1'),
            page([row('c'), row('d')], 'cursor-2'),
            page([row('e')])
        );

        const all = await getTransactions();

        expect(all.map((t) => t._id)).toEqual(['a', 'b', 'c', 'd', 'e']);
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    test('feeds each page its predecessor cursor', async () => {
        respondWith(
            page([row('a')], 'cursor-1'),
            page([row('b')], 'cursor-2'),
            page([row('c')])
        );

        await getTransactions();

        const urls = calledUrls();
        expect(urls[0]).not.toContain('cursor=');
        expect(urls[1]).toContain('cursor=cursor-1');
        expect(urls[2]).toContain('cursor=cursor-2');
    });

    test('stops after one request when there is nothing more', async () => {
        respondWith(page([row('a')]));

        await getTransactions();

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('stops if the server claims more but sends no cursor', async () => {
        // Defensive: without this the loop would refetch page one forever.
        respondWith({ transactions: [row('a')], hasMore: true, nextCursor: null });

        const all = await getTransactions();

        expect(all).toHaveLength(1);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('an empty account yields an empty list', async () => {
        respondWith(page([]));

        expect(await getTransactions()).toEqual([]);
    });

    test('a failure part way through propagates rather than returning a partial list', async () => {
        let call = 0;
        global.fetch = jest.fn(() => {
            call += 1;
            if (call === 1) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve(page([row('a')], 'cursor-1')) });
            }
            return Promise.resolve({
                ok: false,
                json: () => Promise.resolve({ message: 'Failed to fetch transactions' }),
            });
        });

        // A silently truncated history would quietly wrong every all-time figure,
        // so a partial result must not look like success.
        await expect(getTransactions()).rejects.toThrow('Failed to fetch transactions');
    });
});
