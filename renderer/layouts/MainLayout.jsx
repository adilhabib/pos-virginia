(function() {
  function MainLayout({ sidebar, topbar, children }) {
    return (
      <div className="flex h-screen w-full bg-[#f4f5f6] overflow-hidden text-[#232628] font-sans">
        <div className="w-[100px] lg:w-64 flex-shrink-0 transition-all duration-300 z-10 border-r border-gray-200">
          {sidebar}
        </div>
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="z-20">
            {topbar}
          </div>
          <main className="flex-1 overflow-auto p-4 lg:p-8 relative">
            <div className="max-w-[1600px] mx-auto w-full h-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    );
  }

  window.POSLayouts = window.POSLayouts || {};
  window.POSLayouts.MainLayout = MainLayout;
})();
