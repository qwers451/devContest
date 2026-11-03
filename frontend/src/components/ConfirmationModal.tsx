import React from 'react';

const ConfirmationModal = ({
    show,
    onHide,
    onConfirm,
    title = 'Подтверждение',
    message = 'Вы уверены?',
    confirmText = 'Подтвердить',
    cancelText = 'Отмена',
    confirmVariant = 'danger'
}) => {
    if (!show) return null;

    const btnCls = confirmVariant === 'danger'
        ? 'px-5 py-2 rounded-md bg-red-500 hover:bg-red-600 text-white text-[13px] font-semibold transition-colors'
        : 'px-5 py-2 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-semibold transition-colors';

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={onHide}
        >
            <div
                className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4 animate-fade-in"
                onClick={e => e.stopPropagation()}
            >
                <h3 className="text-[14px] font-medium text-gray-900 mb-2">{title}</h3>
                <p className="text-[13px] text-gray-400 mb-6 leading-relaxed">{message}</p>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onHide}
                        className="px-5 py-2 rounded-md border border-gray-700 text-[13px] text-gray-400 hover:bg-gray-900 font-medium transition-colors"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={() => { onConfirm(); onHide(); }}
                        className={btnCls}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
