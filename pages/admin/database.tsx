import { useState, useEffect } from 'react';
import Head from 'next/head';

interface TableData {
  name: string;
  count: number;
}

export default function DatabaseAdmin() {
  const [tables, setTables] = useState<TableData[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableData, setTableData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch available tables
    fetch('/api/admin/db-tables')
      .then(res => res.json())
      .then(data => setTables(data.tables || []));
  }, []);

  const loadTableData = async (tableName: string) => {
    setSelectedTable(tableName);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/db-data?table=${tableName}`);
      const data = await res.json();
      setTableData(data.data || []);
    } catch (error) {
      console.error('Error loading table data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Database Admin - Maxxit</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
            🗄️ Database Admin
          </h1>

          <div className="grid grid-cols-12 gap-6">
            {/* Sidebar - Tables List */}
            <div className="col-span-3 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                Tables
              </h2>
              <div className="space-y-2">
                {tables.map(table => (
                  <button
                    key={table.name}
                    onClick={() => loadTableData(table.name)}
                    className={`w-full text-left px-3 py-2 rounded transition-colors ${
                      selectedTable === table.name
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    <div className="font-medium">{table.name}</div>
                    <div className="text-sm opacity-70">{table.count} rows</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Main Content - Table Data */}
            <div className="col-span-9 bg-white dark:bg-gray-800 rounded-lg shadow">
              {selectedTable ? (
                <>
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {selectedTable}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {tableData.length} records
                    </p>
                  </div>

                  <div className="overflow-auto max-h-[calc(100vh-200px)]">
                    {loading ? (
                      <div className="p-8 text-center text-gray-500">
                        Loading...
                      </div>
                    ) : tableData.length > 0 ? (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                          <tr>
                            {Object.keys(tableData[0]).map(key => (
                              <th
                                key={key}
                                className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300"
                              >
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {tableData.map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                              {Object.values(row).map((value: any, cellIdx) => (
                                <td
                                  key={cellIdx}
                                  className="px-4 py-3 text-gray-900 dark:text-white"
                                >
                                  {typeof value === 'object'
                                    ? JSON.stringify(value)
                                    : value?.toString() || 'null'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="p-8 text-center text-gray-500">
                        No data in this table
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  Select a table to view data
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

