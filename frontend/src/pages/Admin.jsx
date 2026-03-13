import React from 'react';
import AddContestTypePanel from '../components/adminComponents/AddContestTypePanel.jsx';
import ImportExportPanel from '../components/adminComponents/ImportExportPanel.jsx';
import StatisticsPanel from '../components/adminComponents/StatisticsPanel.jsx';

const Admin = () => {
    return (
        <div className="min-h-screen bg-gray-50 py-6">
            <div className="max-w-5xl mx-auto px-4">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">Панель администратора</h1>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <AddContestTypePanel />
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <ImportExportPanel />
                    </div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <StatisticsPanel />
                </div>
            </div>
        </div>
    );
};

export default Admin;
