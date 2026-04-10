(function() {
  function Topbar({ dateString }) {
    return (
      <header className="h-20 bg-white shadow-sm flex items-center justify-between px-8">
        <div className="flex-1">
          <div className="relative w-96">
            <input 
              type="text" 
              placeholder="Search product or any order..." 
              className="w-full pl-4 pr-10 py-2 bg-gray-100 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
            />
            <span className="absolute right-3 top-2.5 text-gray-400 font-bold">Q</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-gray-600 font-medium bg-gray-50 px-4 py-2 rounded-xl">
            📅 <span>{dateString}</span>
          </div>
          <button className="w-10 h-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center hover:bg-teal-200">
            🔔
          </button>
        </div>
      </header>
    );
  }

  window.POSComponents = window.POSComponents || {};
  window.POSComponents.Topbar = Topbar;
})();
