import React from 'react';
import AddContestTypePanel from '../components/adminComponents/AddContestTypePanel';
import ImportExportPanel from '../components/adminComponents/ImportExportPanel';
import StatisticsPanel from '../components/adminComponents/StatisticsPanel';

const Admin = () => {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-6">
            <div className="max-w-5xl mx-auto px-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Панель администратора</h1>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                        <AddContestTypePanel />
                    </div>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                        <ImportExportPanel />
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                    <StatisticsPanel />
                </div>
            </div>
        </div>
    );
};

export default Admin;
