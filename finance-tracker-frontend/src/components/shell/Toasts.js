import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { BoltIcon, MedalIcon } from './icons';

const Toasts = () => {
    const { toasts } = useAppState();

    return (
        <div className="bq-toasts" role="status" aria-live="polite">
            {toasts.map((toast) => (
                <div key={toast.id} className={`bq-toast ${toast.kind || ''}`}>
                    <span className="ti">
                        {toast.kind === 'win' ? <MedalIcon size={15} /> : <BoltIcon size={15} />}
                    </span>
                    <span>
                        <span className="tt">{toast.title}</span>
                        {toast.sub && <><br /><span className="ts">{toast.sub}</span></>}
                    </span>
                </div>
            ))}
        </div>
    );
};

export default Toasts;
