#include "editor_implementation.h"
#include "editor_desktop.h"
#include "native_text_clipboard.h"
#include "native_document_launch.h"
#include "native_document_open.h"
#include "lua_script_report_dialog.h"
#include "lua_script_numeric_widgets.h"
#include "lua_script_dialog_window.h"
#include "lua_script_window_host.h"
#include "extension_form_window.h"

using namespace moon::editor;
using namespace moon;

int app_main(int argc,char* argv[]) {

  try {

    if(argc==3 && std::string(argv[1])=="--recovery-crash-verify") {

      const auto root=std::filesystem::u8path(argv[2]);if(!root.is_absolute() || !std::filesystem::exists(root/"test-owned.marker"))return 2;

      const auto records=project::listRecoveryRecords(root/"recovery");if(records.size()!=1 || records[0].id!="crash-fixture")return 3;

      std::ifstream file(root/"recovery/crash-fixture.moonsprite",std::ios::binary);auto bytes=std::make_shared<project::Bytes>(std::istreambuf_iterator<char>(file),std::istreambuf_iterator<char>());

      const auto parsed=project::prepareEditableImport(project::readProjectManifest(bytes));

      if(parsed.width!=3 || parsed.height!=2 || parsed.timeline.cels[0].surface->pixels[4]!=0xff123456)return 4;

      std::ofstream(root/"verified.marker")<<"restored";return 0;

    }

    if(argc==3 && std::string(argv[1])=="--recovery-crash-fixture") {

      const auto root=std::filesystem::u8path(argv[2]);

      if(!root.is_absolute() || !std::filesystem::exists(root/"test-owned.marker"))throw std::runtime_error("Recovery fixture requires an explicitly owned test directory");

      Document fixture(3,2);fixture.beginStroke({1,1},0xff123456);fixture.commitStroke();

      const auto encoded=project::encodeRecoveryProject(fixture);

      project::writeRecoveryFiles(root/"recovery",{"crash-fixture","异常退出样本","1"},*encoded.bytes);

      std::ofstream(root/"ready.marker")<<GetCurrentProcessId();

      Sleep(INFINITE);return 0;

    }

    std::vector<std::string> launchArguments;for(int i=1;i<argc;++i)launchArguments.push_back(argv[i]);
    const bool automatedLaunch=document_launch::automation(launchArguments);
    std::unique_ptr<document_launch::Instance> fileInstance;
    if(!automatedLaunch){fileInstance=std::make_unique<document_launch::Instance>();const auto paths=document_launch::supported(launchArguments);if(!fileInstance->primary()){fileInstance->forward(paths);return 0;}fileInstance->enqueue(paths);}

    const auto assets=std::filesystem::u8path(argv[0]).parent_path()/"assets";

    auto system=os::System::make(); system->setAppMode(os::AppMode::GUI);

    // Device-pixel framebuffer/input; skins and Fusion font alone paint at 2x.

    os::WindowSpec spec(1280,960,1); spec.resizable(true); spec.maximizable(true);

    auto window=system->makeWindow(spec);

    if(!SetWindowSubclass(static_cast<HWND>(window->nativeHandle()),resizeLimits,1,0))throw std::runtime_error("Cannot set native resize limits");

    window->setTitle("MoonSprite Native - Development");

    ui::UISystem uiSystem;
    NativeTextClipboard textClipboard(uiSystem);

    PixelTheme theme((assets/"fusion-ascii.png").u8string()); ui::set_theme(&theme,uiScale);

    PixelFont font((assets/"fonts/fusion-pixel-10px-monospaced-zh_hans.bdf").u8string()); Skin skin=Skin::load(assets/"dark.skin");

    auto themePath=assets/"themes/moonsprite-dark/theme.xml";

    auto cursorPath=assets/"cursors";

    for(int i=1;i<argc;++i) if(std::string(argv[i])=="--theme") {

      if(i+1>=argc) throw std::runtime_error("--theme needs a theme.xml path");

      themePath=std::filesystem::u8path(argv[++i]);

    }

    for(int i=1;i<argc;++i) if(std::string(argv[i])=="--cursors") {

      if(i+1>=argc) throw std::runtime_error("--cursors needs a directory");

      cursorPath=std::filesystem::u8path(argv[++i]);

    }

    skin.assets=loadThemeAtlas(themePath).assets;theme.skin=&skin;

    // Manager must exist before the desktop's window is opened.

    Manager manager(window); Desktop desktop; manager.desktop=&desktop;

    LegacyCursors cursors(cursorPath,cursorPath==assets/"cursors"?&skin.assets:nullptr);

    if(argc>1 && std::string(argv[1])=="--cursor-apply-check") {

      for(const auto* id:{"default","none","none","selection-move","copy","none","ew-resize","ns-resize","nwse-resize","nesw-resize","selection-rotate-n","selection-rotate-ne","selection-rotate-se","selection-rotate-s","selection-rotate-sw","selection-rotate-nw","pencil-white","unavailable","default"}) {

        applyLegacyCursor(*window,cursors,id);

        const auto expected=std::string(id)=="none"?nullptr:static_cast<HCURSOR>(cursors.get(id)->nativeHandle());

        if(GetCursor()!=expected)throw std::runtime_error("Legacy cursor handle transition failed");

      }

      return 0;

    }

    manager.refreshCursor=[&] {

      const auto pos=window->pointFromScreen(ui::get_mouse_position());

      const auto editor=desktop.editor;

      const auto picked=manager.pickFromScreenPos(ui::get_mouse_position());

      // Legacy styles.css range inputs, thumb and track all use the default

      // cursor. Capture keeps that ownership when a slider drag leaves it.

      const bool sliderPointer=dynamic_cast<PixelSlider*>(manager.getCapture()) ||

        (!manager.getCapture() && dynamic_cast<PixelSlider*>(picked));

      const auto cursorOwner=manager.getCapture()?manager.getCapture():picked;

      const auto popup=cursorOwner?dynamic_cast<PixelPopupWindow*>(cursorOwner->window()):nullptr;

      const auto popupPos=popup && popup->display() && popup->display()->nativeWindow()?popup->display()->nativeWindow()->pointFromScreen(ui::get_mouse_position()):pos;
      const char* id=sliderPointer?"default":popup?popup->geometryCursor(popupPos):editor && (editor->panelHasCapture() || (picked && (picked==editor || picked->hasAncestor(editor))))?editor->cursorAt(pos):"default";

      // setCursor is also needed after the OS resets it on entering the window.

      applyLegacyCursor(*window,cursors,id);

      if(editor)editor->refreshCanvasPointerFeedback();

    };

    manager.addMessageFilter(ui::kKeyDownMessage,&manager);manager.addMessageFilter(ui::kKeyUpMessage,&manager);manager.addMessageFilter(ui::kSetCursorMessage,&manager);manager.addMessageFilter(ui::kFocusEnterMessage,&manager);manager.addMessageFilter(ui::kFocusLeaveMessage,&manager);

    for(const auto type:{ui::kMouseDownMessage,ui::kMouseMoveMessage,ui::kMouseEnterMessage,ui::kMouseLeaveMessage,ui::kMouseWheelMessage}) manager.addMessageFilter(type,&manager);

    std::filesystem::path recoveryRoot;for(int i=1;i+1<argc;++i)if(std::string(argv[i])=="--recovery-test-root"){const auto root=std::filesystem::u8path(argv[i+1]);if(!root.is_absolute() || !std::filesystem::exists(root/"test-owned.marker"))throw std::runtime_error("Recovery test root must be owned");recoveryRoot=root/"recovery";}

    const bool toolRailCheck=argc>1 && std::string(argv[1])=="--tool-rail-check";
    auto editor=new Editor(font,skin,assets,manager.refreshCursor,recoveryRoot,toolRailCheck||(argc>1&&std::string(argv[1])=="--free-tile-transform-check")); desktop.editor=editor;
    bool usageTesting=false;for(int i=1;i<argc;++i){const std::string a=argv[i];if(a.find("--")==0&&(a.find("check")!=std::string::npos||a.find("smoke")!=std::string::npos||a.find("test")!=std::string::npos))usageTesting=true;}editor->initializeUsageStatistics(usageTesting);editor->initializeDiagnostics(usageTesting);editor->initializeGallery(usageTesting);editor->initializeHomeBanner(usageTesting);

    if(argc>1 && std::string(argv[1])=="--export-dialog-check") {try{editor->smokeStaticExport();}catch(const std::exception& e){std::ofstream("native-export-dialog-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--color-editor-check") {try{editor->smokeColorEditor();}catch(const std::exception& e){std::ofstream("native-color-editor-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--adjustment-components-check") {try{editor->smokeAdjustmentComponents();}catch(const std::exception& e){std::ofstream("native-adjustment-components-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--color-overlay-check") {try{editor->smokeColorOverlay();}catch(const std::exception& e){std::ofstream("native-color-overlay-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--gradient-map-check") {try{editor->smokeGradientMap();}catch(const std::exception& e){std::ofstream("native-gradient-map-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--anti-alias-check") {try{editor->smokeAntiAlias();}catch(const std::exception& e){std::ofstream("native-anti-alias-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--background-preset-check") {try{editor->smokeBackgroundPreset();}catch(const std::exception& e){std::ofstream("native-background-preset-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--canvas-trim-check") {try{editor->smokeCanvasTrim();}catch(const std::exception& e){std::ofstream("native-canvas-trim-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--convolution-check") {try{editor->smokeConvolution();}catch(const std::exception& e){std::ofstream("native-convolution-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--checkerboard-preferences-check") {try{editor->smokeCheckerboardPreferences();}catch(const std::exception& e){std::ofstream("native-checkerboard-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--preferences-runtime-check") {desktop.addChild(editor);desktop.setBounds(manager.bounds());desktop.openWindow();try{editor->smokeRuntimePreferences(!recoveryRoot.empty());}catch(const std::exception& e){std::ofstream("native-preferences-runtime-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--preferences-catalog-check") {desktop.addChild(editor);desktop.setBounds(manager.bounds());desktop.openWindow();try{editor->smokePreferenceCatalog(std::filesystem::u8path(argv[0]).parent_path(),[&](ui::MouseMessage& event){event.setDisplay(editor->display());event.setFromFilter(true);return manager.onProcessMessage(&event);});}catch(const std::exception& e){std::ofstream("native-preferences-catalog-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--preferences-check") {try{editor->smokePreferences(std::filesystem::u8path(argv[0]).parent_path());}catch(const std::exception& e){std::ofstream("native-preferences-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--panel-scroll-check") {desktop.addChild(editor);desktop.setBounds(manager.bounds());desktop.openWindow();try{editor->smokePanelScroll();}catch(const std::exception& e){std::ofstream("native-panel-scroll-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--brush-preview-check") {try{editor->smokeBrushPreview();}catch(const std::exception& e){std::ofstream("native-brush-preview-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--brush-preview-performance-check") {desktop.addChild(editor);desktop.setBounds(manager.bounds());desktop.openWindow();try{editor->smokeBrushPreviewPerformance();}catch(const std::exception& e){std::ofstream("build/brush-preview-performance-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--group-timeline-check") {desktop.addChild(editor);desktop.setBounds(manager.bounds());desktop.openWindow();try{editor->smokeGroupTimeline(std::filesystem::u8path(argv[0]).parent_path());}catch(const std::exception& e){std::ofstream("build/group-timeline-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--large-timeline-performance-check") {desktop.addChild(editor);desktop.setBounds(manager.bounds());desktop.openWindow();try{editor->smokeLargeTimelinePerformance();}catch(const std::exception& e){std::ofstream("build/large-timeline-performance-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--native-window-resize-check") {
      desktop.addChild(editor);desktop.setBounds(manager.bounds());desktop.openWindow();
      try {
        editor->prepareFocusResumeCheck();editor->smokePrepareDockSplitRepaint();manager.dontWaitEvents();
        auto drain=[&]{manager.generateMessages();manager.dispatchMessages();manager.flushRedraw();manager.dispatchMessages();manager.flipAllDisplays();};
        drain();
        const auto hwnd=static_cast<HWND>(window->nativeHandle());RECT original{};
        if(!GetWindowRect(hwnd,&original))throw std::runtime_error("Cannot read native window rectangle");
        std::filesystem::create_directories("build/test-tmp");std::ofstream report("build/test-tmp/native-window-resize.tsv");
        report<<"sample\twindow_call_ms\tdrain_flip_ms\ttotal_ms\tclient_w\tclient_h\n";
        for(int sample=0;sample<16;++sample){
          const auto begin=std::chrono::steady_clock::now();
          if(!SetWindowPos(hwnd,nullptr,0,0,original.right-original.left-(sample%4)*24,original.bottom-original.top-(sample%3)*20,SWP_NOMOVE|SWP_NOZORDER|SWP_NOACTIVATE))throw std::runtime_error("Native resize failed");
          const auto resized=std::chrono::steady_clock::now();drain();const auto done=std::chrono::steady_clock::now();RECT client{};GetClientRect(hwnd,&client);
          auto ms=[](auto duration){return std::chrono::duration<double,std::milli>(duration).count();};
          report<<sample<<'\t'<<ms(resized-begin)<<'\t'<<ms(done-resized)<<'\t'<<ms(done-begin)<<'\t'<<client.right<<'\t'<<client.bottom<<'\n';
          if(window->surface()->width()!=client.right || window->surface()->height()!=client.bottom)throw std::runtime_error("Native resize surface/client mismatch");
          if(const auto frames=std::getenv("MOONSPRITE_RESIZE_FRAMES")){
            const auto directory=std::filesystem::u8path(frames);std::filesystem::create_directories(directory);
            writeSmokeFrame(window->surface(),directory/(std::to_string(sample)+".bmp"));
          }
        }
        SetWindowPos(hwnd,nullptr,0,0,original.right-original.left,original.bottom-original.top,SWP_NOMOVE|SWP_NOZORDER|SWP_NOACTIVATE);drain();
      }catch(const std::exception& e){std::ofstream("build/native-window-resize-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}
      delete editor;desktop.editor=nullptr;return 0;
    }

    if(argc>1 && std::string(argv[1])=="--ui-geometry-performance-check") {desktop.addChild(editor);desktop.setBounds(manager.bounds());desktop.openWindow();try{editor->smokeDockResizeMigration();}catch(const std::exception& e){std::ofstream("build/ui-geometry-performance-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--hit-testing-performance-check") {desktop.addChild(editor);desktop.setBounds(manager.bounds());desktop.openWindow();try{editor->smokeHitTestingPerformance();}catch(const std::exception& e){std::ofstream("build/hit-testing-performance-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--drawing-pan-performance-check") {desktop.addChild(editor);desktop.setBounds(manager.bounds());desktop.openWindow();try{editor->smokeDrawingPanPerformance();}catch(const std::exception& e){std::ofstream("build/drawing-pan-performance-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--wheel-performance-check") {desktop.addChild(editor);desktop.setBounds(manager.bounds());desktop.openWindow();try{editor->smokeWheelPerformance();}catch(const std::exception& e){std::ofstream("build/wheel-performance-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--modifier-brush-performance-check") {desktop.addChild(editor);desktop.setBounds(manager.bounds());desktop.openWindow();try{editor->smokeModifierBrushPerformance();}catch(const std::exception& e){std::ofstream("build/modifier-brush-performance-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--modifiers-check") {try{editor->smokeModifiers();}catch(const std::exception& e){std::ofstream("native-modifiers-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--sampling-zoom-check") {try{editor->smokeSamplingAndZoom(std::filesystem::u8path(argv[0]).parent_path());}catch(const std::exception& e){std::ofstream("native-sampling-zoom-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--menu-pointer-check") {desktop.addChild(editor);desktop.setBounds(manager.bounds());desktop.openWindow();try{editor->smokeMenuPointerOwnership();}catch(const std::exception& e){std::ofstream("native-menu-pointer-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--selection-cursors-check") {try{editor->smokeSelectionCursors();}catch(const std::exception& e){std::ofstream("native-selection-cursors-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--ants-check") {try{editor->smokeAnts(std::filesystem::u8path(argv[0]).parent_path());}catch(const std::exception& e){std::ofstream("native-ants-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && (std::string(argv[1])=="--layer-context-check"||std::string(argv[1])=="--free-tile-transform-check")) {desktop.addChild(editor);desktop.setBounds(manager.bounds());desktop.openWindow();try{editor->smokeLayerContext(std::string(argv[1])=="--free-tile-transform-check"?std::filesystem::path{}:std::filesystem::u8path(argv[0]).parent_path());}catch(const std::exception& e){std::ofstream("native-smoke-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--layers-check") {editor->smokeLayers(std::filesystem::u8path(argv[0]).parent_path());delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--timeline-gif-drop-check") {desktop.addChild(editor);desktop.setBounds(manager.bounds());desktop.openWindow();manager.dispatchMessages();try{editor->smokeTimelineGifDrop();}catch(const std::exception& e){std::ofstream("native-timeline-gif-drop-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--cel-clipboard-check") {try{editor->smokeCelClipboard();editor->smokeFrameCutAndMergeVisible();editor->smokeFrameContextClipboard();editor->smokeCrossProjectFrameClipboard();editor->smokeMigratedTimelineActions();}catch(const std::exception& e){std::ofstream("native-cel-clipboard-error.txt")<<e.what();delete editor;desktop.editor=nullptr;manager.removeMessageFilter(ui::kSetCursorMessage,&manager);return 1;}delete editor;desktop.editor=nullptr;manager.removeMessageFilter(ui::kSetCursorMessage,&manager);return 0;}

    if(argc>1 && std::string(argv[1])=="--deselect-check") {editor->smokeDeselectPending();delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && (std::string(argv[1])=="--tool-property-shortcuts-check"||std::string(argv[1])=="--selection-mode-shortcuts-check"||std::string(argv[1])=="--view-zoom-shortcuts-check"||std::string(argv[1])=="--palette-shortcuts-check")) {desktop.addChild(editor);desktop.setBounds(manager.bounds());desktop.openWindow();try{editor->smokeShortcutSettings();}catch(const std::exception& e){std::ofstream("native-shortcuts-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--symmetry-shortcuts-check") {try{editor->smokeSymmetry();}catch(const std::exception& e){std::ofstream("native-symmetry-shortcuts-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--animation-check") {desktop.addChild(editor);desktop.setBounds(manager.bounds());desktop.openWindow();try{editor->smokeAnimation();}catch(const std::exception& e){std::ofstream("native-animation-error.txt")<<e.what();delete editor;desktop.editor=nullptr;manager.removeMessageFilter(ui::kSetCursorMessage,&manager);return 1;}delete editor;desktop.editor=nullptr;manager.removeMessageFilter(ui::kSetCursorMessage,&manager);return 0;}

    if(argc>1 && std::string(argv[1])=="--performance-ui-check") {try{editor->smokePerformanceUi(std::filesystem::u8path(argv[0]).parent_path().parent_path()/"test-tmp/performance-ui"/std::filesystem::u8path(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64())));}catch(const std::exception& e){std::ofstream("native-performance-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--skin-resize-check") {editor->smokeSkinResize(std::filesystem::u8path(argv[0]).parent_path());delete editor;desktop.editor=nullptr;return 0;}

    editor->closeRequested=[&]{desktop.approved=true;desktop.closeWindow(editor);};

    desktop.addChild(editor); desktop.setBounds(manager.bounds()); desktop.openWindow();

    system->finishLaunching();

    ui::Timer fileLaunchTimer(50,editor);
    if(fileInstance){fileLaunchTimer.Tick.connect([&]{fileInstance->pump([&]{const auto hwnd=static_cast<HWND>(window->nativeHandle());if(IsIconic(hwnd))ShowWindow(hwnd,SW_RESTORE);else ShowWindow(hwnd,SW_SHOW);SetForegroundWindow(hwnd);},[&](const std::vector<std::string>& paths){if(manager.getForegroundWindow()!=&desktop)return false;return dispatchNativeDocumentPaths(*editor,window.get(),paths);});});fileLaunchTimer.start();}

    if(argc>1 && std::string(argv[1])=="--role-hex-check") {try{editor->smokeRoleHex();}catch(const std::exception& e){std::ofstream("native-role-hex-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--sparse-project-io-check") {try{editor->smokeSparseProjectIo(std::filesystem::path("build/sparse-project-io-20261019-owned"));}catch(const std::exception& e){std::ofstream("native-sparse-project-io-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--script-playback-check") {try{editor->smokeScriptPlayback();}catch(const std::exception& e){std::ofstream("native-script-playback-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--playback-floating-check") {try{editor->smokePlaybackFloating();editor->smokeSelectionEnter();editor->smokeLoopTrack();editor->smokeDeleteRouting();}catch(const std::exception& e){std::ofstream("native-playback-floating-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--palette-rename-trim-check") {try{editor->smokePaletteRenameTrim();}catch(const std::exception& e){std::ofstream("native-palette-rename-trim-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--timeline-density-check") {try{editor->smokeTimelineDensity(std::filesystem::u8path(argv[0]).parent_path());}catch(const std::exception& e){std::ofstream("native-timeline-density-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--timeline-tail-check") {try{editor->smokeTimelineTail();}catch(const std::exception& e){std::ofstream("native-timeline-tail-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--timeline-selection-keyboard-check") {try{editor->smokeTimelineSelectionKeyboard();}catch(const std::exception& e){std::ofstream("native-timeline-selection-keyboard-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--palette-clipboard-check") {try{editor->smokePaletteClipboard();}catch(const std::exception& e){std::ofstream("native-palette-clipboard-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--palette-sync-check") {try{editor->smokePaletteSynchronization();}catch(const std::exception& e){std::ofstream("native-palette-sync-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--toggle-release-check") {try{editor->smokeToggleRelease();}catch(const std::exception& e){std::ofstream("native-toggle-release-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--palette-gradient-check") {try{editor->smokePaletteGradient();}catch(const std::exception& e){std::ofstream("native-palette-gradient-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--cel-content-selection-check") {try{editor->smokeCelContentSelection();}catch(const std::exception& e){std::ofstream("native-cel-content-selection-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--palette-names-check") {try{editor->smokePaletteNames();}catch(const std::exception& e){std::ofstream("native-palette-names-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--palette-sort-check") {try{editor->smokePaletteSort();}catch(const std::exception& e){std::ofstream("native-palette-sort-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--auto-link-logical-scope-check") {try{editor->smokeAutoLinkLogicalScope();}catch(const std::exception& e){std::ofstream("native-auto-link-logical-scope-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--auto-link-keyboard-check") {try{editor->smokeAutoLinkKeyboard();}catch(const std::exception& e){std::ofstream("native-auto-link-keyboard-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--plain-number-check") {try{editor->smokePlainNumberEntry();}catch(const std::exception& e){std::ofstream("native-plain-number-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--multi-document-check"){try{editor->smokeMultiDocument();}catch(const std::exception& e){std::ofstream("native-multi-document-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--modal-components-check") {desktop.addChild(editor);desktop.setBounds(manager.bounds());desktop.openWindow();try{editor->smokeModalComponents();}catch(const std::exception& e){std::ofstream("native-modal-components-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--dialog-geometry-check") {try{checkDialogGeometry(font,skin,[&](ui::MouseMessage& message){return manager.onProcessMessage(&message);});}catch(const std::exception& e){std::ofstream("native-dialog-geometry-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--new-document-check") {try{editor->smokeNewDocument();}catch(const std::exception& e){std::ofstream("native-new-document-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--checkbox-check") {try{editor->smokeCheckboxes(std::filesystem::u8path(argv[0]).parent_path());}catch(const std::exception& e){std::ofstream("native-checkbox-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--switch-check") {try{editor->smokeSwitches(std::filesystem::u8path(argv[0]).parent_path());}catch(const std::exception& e){std::ofstream("native-switch-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--relative-luminance-check") {try{editor->smokeRelativeLuminance();}catch(const std::exception& e){std::ofstream("native-relative-luminance-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--fullscreen-check") {try{editor->smokeFullscreen();}catch(const std::exception& e){std::ofstream("native-fullscreen-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--project-folder-check") {try{editor->smokeProjectFolder();}catch(const std::exception& e){std::ofstream("native-project-folder-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--preview-luminance-check") {try{editor->smokePreviewLuminanceContract();}catch(const std::exception& e){std::ofstream("native-preview-luminance-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--layer-label-width-check") {try{editor->smokeLayerLabelWidth();}catch(const std::exception& e){std::ofstream("native-layer-label-width-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--animation-settings-check") {try{editor->smokeAnimationSettings();}catch(const std::exception& e){std::ofstream("native-animation-settings-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--sheet-open-after-check") {try{editor->smokeSheetOpenAfterExport();}catch(const std::exception& e){std::ofstream("native-sheet-open-after-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--sheet-new-document-check") {try{editor->smokeSheetNewDocument();}catch(const std::exception& e){std::ofstream("native-sheet-new-document-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--sheet-png-auto-check") {try{editor->smokeSpriteSheetAutomatic();}catch(const std::exception& e){std::ofstream("native-sheet-png-auto-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--export-folder-check") {try{editor->smokeExportFolder();}catch(const std::exception& e){std::ofstream("native-export-folder-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--svg-frame-export-check") {try{editor->smokeSvgFrameExport();}catch(const std::exception& e){std::ofstream("native-svg-frame-export-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--palette-reverse-check") {try{editor->smokePaletteReverse();}catch(const std::exception& e){std::ofstream("native-palette-reverse-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--ico-frame-export-check") {try{editor->smokeIcoFrameExport();}catch(const std::exception& e){std::ofstream("native-ico-frame-export-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--bmp-frame-export-check") {try{editor->smokeBmpFrameExport();}catch(const std::exception& e){std::ofstream("native-bmp-frame-export-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--loop-unicode-name-check") {try{editor->smokeLoopUnicodeName();}catch(const std::exception& e){std::ofstream("native-loop-unicode-name-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--gradient-shape-check") {try{editor->smokeGradientShape();}catch(const std::exception& e){std::ofstream("native-gradient-shape-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--about-check") {try{editor->smokeAbout();}catch(const std::exception& e){std::ofstream("native-about-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--paste-new-document-check") {try{editor->smokePasteAsNewDocument();}catch(const std::exception& e){std::ofstream("native-paste-new-document-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--advanced-mode-check") {try{editor->smokeAdvancedMode();}catch(const std::exception& e){std::ofstream("native-advanced-mode-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}
    if(argc>1 && std::string(argv[1])=="--grid-snap-quick-check") {try{editor->smokeGridSnapQuick();}catch(const std::exception& e){std::ofstream("native-grid-snap-quick-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--custom-grid-check") {try{editor->smokeCustomGrid();}catch(const std::exception& e){std::ofstream("native-custom-grid-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--quantization-morph-check") {try{editor->smokeQuantizationMorph();}catch(const std::exception& e){std::ofstream("native-quantization-morph-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--moon-crossfade-check") {try{editor->smokeMoonCrossfade();}catch(const std::exception& e){std::ofstream("native-moon-crossfade-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--metadata-normal-grid-check") {try{editor->smokeMetadataNormalGrid();}catch(const std::exception& e){std::ofstream("native-metadata-normal-grid-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--wheel-blend-square-check") {try{editor->smokeWheelBlendSquare();}catch(const std::exception& e){std::ofstream("native-wheel-blend-square-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--cel-picker-check") {try{editor->smokeCelAndPicker();}catch(const std::exception& e){std::ofstream("native-cel-picker-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--palette-import-check") {try{editor->smokePaletteImport();}catch(const std::exception& e){std::ofstream("native-palette-import-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--palette-library-check") {try{editor->smokePaletteLibrary();}catch(const std::exception& e){std::ofstream("native-palette-library-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--palette-manual-check") {try{editor->smokePaletteManual();}catch(const std::exception& e){std::ofstream("native-palette-manual-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--static-layer-batch-check") {try{editor->smokeStaticLayerBatch();}catch(const std::exception& e){std::ofstream("native-static-layer-batch-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--animation-layer-batch-check") {try{editor->smokeAnimationLayerBatch();}catch(const std::exception& e){std::ofstream("native-animation-layer-batch-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--animation-selection-export-check") {try{editor->smokeAnimationSelectionExport();}catch(const std::exception& e){std::ofstream("native-animation-selection-export-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--webp-export-check") {try{editor->smokeWebpExport();}catch(const std::exception& e){std::ofstream("native-webp-export-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--jpeg-frames-columns-check") {try{editor->smokeJpegFramesAndPaletteColumns();}catch(const std::exception& e){std::ofstream("native-jpeg-frames-columns-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--jpeg-export-check") {try{editor->smokeJpegExport();}catch(const std::exception& e){std::ofstream("native-jpeg-export-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--palette-paths-check") {try{editor->smokePalettePngRecentPaths();}catch(const std::exception& e){std::ofstream("native-palette-paths-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--export-protection-check") {try{editor->smokeExportProtection();}catch(const std::exception& e){std::ofstream("native-export-protection-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--extraction-names-check") {try{editor->smokeExtractionNames();}catch(const std::exception& e){std::ofstream("native-extraction-names-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--export-success-sound-check") {try{editor->smokeExportSuccessSound();}catch(const std::exception& e){std::ofstream("native-export-success-sound-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--append-extraction-count-check") {try{editor->smokeAppendExtractionCount();}catch(const std::exception& e){std::ofstream("native-append-extraction-count-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--custom-export-scales-check") {try{editor->smokeCustomExportScales();}catch(const std::exception& e){std::ofstream("native-custom-export-scales-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--gif-layer-target-check") {try{editor->smokeGifLayerTarget();}catch(const std::exception& e){std::ofstream("native-gif-layer-target-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--duplicate-last-layer-check") {try{editor->smokeDuplicateLayerRows();}catch(const std::exception& e){std::ofstream("native-duplicate-last-layer-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--frame-duration-input-check") {try{editor->smokeFrameDurationInput();}catch(const std::exception& e){std::ofstream("native-frame-duration-input-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--export-format-preference-check") {try{editor->smokeExportFormatPreference();}catch(const std::exception& e){std::ofstream("native-export-format-preference-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--recent-export-directory-check") {try{editor->smokeRecentExportDirectory();}catch(const std::exception& e){std::ofstream("native-recent-export-directory-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--export-memory-check") {try{editor->smokeExportMemory();}catch(const std::exception& e){std::ofstream("native-export-memory-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--layer-export-check") {try{editor->smokeLayerStaticExport();}catch(const std::exception& e){std::ofstream("native-layer-export-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--svg-export-check") {try{editor->smokeSvgExport();}catch(const std::exception& e){std::ofstream("native-svg-export-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--ico-export-check") {try{editor->smokeIcoExport();}catch(const std::exception& e){std::ofstream("native-ico-export-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--bmp-export-check") {try{editor->smokeBmpExport();}catch(const std::exception& e){std::ofstream("native-bmp-export-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--png-auto-export-check") {try{editor->smokePngAutomatic();}catch(const std::exception& e){std::ofstream("native-png-auto-export-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--frame-png-export-check") {try{editor->smokeFramePngExport();}catch(const std::exception& e){std::ofstream("native-frame-png-export-error.txt")<<e.what();delete editor;desktop.editor=nullptr;return 1;}delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--migration-batch-check") {try{editor->smokeCurrentMigrationBatch();}catch(const std::exception& e){std::ofstream("native-migration-batch-error.txt")<<e.what();delete editor;desktop.editor=nullptr;manager.removeMessageFilter(ui::kSetCursorMessage,&manager);return 1;}delete editor;desktop.editor=nullptr;manager.removeMessageFilter(ui::kSetCursorMessage,&manager);return 0;}

    if(argc>1 && std::string(argv[1])=="--preview-labels-check") {editor->smokeMergedPreviewLabels(std::filesystem::u8path(argv[0]).parent_path());delete editor;desktop.editor=nullptr;return 0;}

    if(argc>1 && std::string(argv[1])=="--docking-check") {editor->smokeDocking(std::filesystem::u8path(argv[0]).parent_path());delete editor;desktop.editor=nullptr;return 0;}

    ui::set_use_native_cursors(true); manager.refreshCursor();

    const bool scriptEntryCheck=argc>1&&std::string(argv[1])=="--script-entry-check";
    ui::Timer scriptEntryTimer(80,editor);if(scriptEntryCheck){scriptEntryTimer.Tick.connect([&]{scriptEntryTimer.stop();try{editor->smokeScriptEntry();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-script-entry-error.txt")<<e.what();std::exit(1);}});scriptEntryTimer.start();}else if(!usageTesting)editor->initializeScripts();
    const bool extensionFormCheck=argc>1&&std::string(argv[1])=="--extension-form-check";
    std::unique_ptr<extension::FormWindow> extensionForm;Skin extensionFormIcons;ui::Timer extensionFormTimer(50,editor);
    if(extensionFormCheck){
      for(const auto suffix:{"","-disabled"})extensionFormIcons.assets.patches[std::string("close")+suffix]=importSkinPng(assets/"utility-icons"/(std::string("close")+suffix+".png"),32);
      using namespace winrt::Windows::Data::Json;
      auto model=JsonObject::Parse(LR"({"nodes":[{"id":"name","type":"input","label":"名称","value":"initial"},{"id":"scale","type":"number","label":"缩放","value":0,"min":0,"max":4},{"id":"event","type":"select","label":"条件","value":"idle","options":[{"value":"idle","label":"空闲"},{"value":"tool","label":"工具"}]},{"id":"dependent","type":"text","label":"工具条件","visibleWhen":{"event":"tool"}},{"id":"save","type":"button","label":"保存","action":{"type":"save"}},{"id":"toggle","type":"toggle","label":"显示","value":false,"action":{"type":"toggle"}}]})");
      {auto image=JsonObject::Parse(LR"({"id":"preview","type":"image","label":"预览","width":64,"height":32,"src":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP4z8DwHwgbABB5A359Y87XAAAAAElFTkSuQmCC"})");model.GetNamedArray(L"nodes").Append(image);}
      extensionForm=std::make_unique<extension::FormWindow>(font,skin,extensionFormIcons,U"扩展表单",[&,model](JsonObject message)mutable{if(message.GetNamedObject(L"values").GetNamedString(L"name")!=L"native draft")throw std::runtime_error("Native form draft lost");JsonObject result;result.Insert(L"requestId",message.GetNamedValue(L"requestId"));model.Insert(L"result",result);extensionForm->receive(model,0);},[]{});
      extensionForm->setDisplay(editor->display(),false);const auto area=editor->display()->bounds();extensionForm->setBounds({area.x+40,area.y+40,480*uiScale,300*uiScale});extensionForm->receive(model,0);extensionForm->pump();extensionForm->openWindow();
      extensionFormTimer.Tick.connect([&,phase=0]()mutable{try{
        extensionForm->pump();if(phase==0){auto* entry=dynamic_cast<PixelEntry*>(extensionForm->controlForCheck(L"name"));auto* save=dynamic_cast<PixelButton*>(extensionForm->controlForCheck(L"save"));if(!entry||!save||!entry->isVisible())throw std::runtime_error("Native form widgets missing");entry->setText("native draft");entry->Change();save->Click();if(!extensionForm->stateForCheck().busy()||save->isEnabled())throw std::runtime_error("Native form busy gating");++phase;return;}
        if(phase==1){extensionForm->pump();if(extensionForm->imageCountForCheck()!=1)throw std::runtime_error("Native form image cache missing");if(extensionForm->stateForCheck().busy()||extensionForm->stateForCheck().drafts().Size())throw std::runtime_error("Native form matched response");writeSmokeFrame(extensionForm->display()->nativeSurface().get(),assets.parent_path()/"extension-form-smoke.bmp");extensionForm->closeFromHost();extensionFormTimer.stop();desktop.approved=true;desktop.closeWindow(editor);}
      }catch(const std::exception& e){std::ofstream("native-extension-form-error.txt")<<e.what();std::exit(1);}});extensionFormTimer.start();
    }
    const bool scriptHostCheck=argc>1&&std::string(argv[1])=="--script-window-host-check";
    std::unique_ptr<script::Runtime> scriptHostRuntime;std::unique_ptr<script::Client> scriptHostClient;std::unique_ptr<ScriptWindowHost> scriptHost;std::unique_ptr<Document> scriptHostDocument;Skin scriptHostIcons;ui::Timer scriptHostTimer(30,editor);
    if(scriptHostCheck){
      const auto root=assets.parent_path()/"script-window-host-test-owned";std::filesystem::create_directories(root/"scripts");std::ofstream(root/"test-owned.marker")<<"script window host fixture";
      std::ofstream(root/"scripts/host.lua")<<R"(local a; a=Dialog{title='First',onclose=function() print('close:'..a.data.name) end}; a:entry{id='name',text='first'}; a:button{id='apply',text='Apply',onclick=function() print(a.data.name) end}; a:show{wait=false}; local b; b=Dialog{title='Second',onclose=function() print('close:'..b.data.name) end}; b:entry{id='name',text='second'}; b:show{wait=false})";
      for(const auto suffix:{"","-disabled"})scriptHostIcons.assets.patches[std::string("close")+suffix]=importSkinPng(assets/"utility-icons"/(std::string("close")+suffix+".png"),32);
      scriptHostRuntime=std::make_unique<script::Runtime>(root);scriptHostClient=std::make_unique<script::Client>(*scriptHostRuntime);scriptHostDocument=std::make_unique<Document>(3,1);
      // Null is an explicit isolated raster fixture, never a production MSE snapshot.
      scriptHost=std::make_unique<ScriptWindowHost>(*scriptHostClient,font,skin,scriptHostIcons,editor->display(),root/"color-size.txt",[](const Document&){return std::string("null");});scriptHost->run(scriptHostDocument.get(),"host.lua");
      scriptHostTimer.Tick.connect([&,phase=0,ticks=0,first=std::string{},second=std::string{}]()mutable{try{
        if(++ticks>300)throw std::runtime_error("Script window host timeout");scriptHost->pump(scriptHostDocument.get(),std::chrono::steady_clock::now()+std::chrono::milliseconds(3));if(scriptHostClient->running())return;
        auto require=[](bool ok,const char* error){if(!ok)throw std::runtime_error(error);};using namespace winrt::Windows::Data::Json;
        if(phase==0){require(scriptHost->windowCount()==2,"Host did not open two real Lua windows");auto models=JsonArray::Parse(winrt::to_hstring(scriptHostClient->session()->dialogsJson));first=winrt::to_string(models.GetObjectAt(0).GetNamedString(L"id"));second=winrt::to_string(models.GetObjectAt(1).GetNamedString(L"id"));scriptHost->window(second)->editEntryForCheck("name","other draft");scriptHost->window(first)->editEntryForCheck("name","native draft");scriptHost->window(first)->clickForCheck("apply");require(scriptHost->window(first)->busyForCheck()&&!scriptHostClient->running(),"Window action was not queued");++phase;return;}
        if(phase==1){require(scriptHostClient->report()&&scriptHostClient->report()->output==std::vector<std::string>{"native draft"}&&scriptHost->hasReport(),"Real callback/report failed");require(JsonObject::Parse(winrt::to_hstring(scriptHost->window(second)->draftValuesForCheck())).GetNamedString(L"name")==L"second","Unchanged other model did not reset draft");scriptHost->queueEscape();++phase;return;}
        if(phase==2){require(!scriptHost->hasReport()&&scriptHost->windowCount()==2,"Report Escape closed dialog");scriptHost->window(second)->editEntryForCheck("name","title draft");scriptHost->window(second)->closeWindow(nullptr);require(scriptHost->window(second)->parent()!=nullptr,"Native close bypassed queued Lua close");++phase;return;}
        if(phase==3){require(scriptHost->windowCount()==1&&!scriptHost->window(second)&&scriptHostClient->report()&&scriptHostClient->report()->output==std::vector<std::string>{"close:title draft"},"Title close lost draft/session");scriptHost->queueEscape();++phase;return;}
        if(phase==4){scriptHost->window(first)->editEntryForCheck("name","escape draft");scriptHost->queueEscape();++phase;return;}
        if(phase==5){require(!scriptHostClient->session()&&scriptHost->windowCount()==0&&scriptHostClient->report()&&scriptHostClient->report()->output==std::vector<std::string>{"close:native draft"},"Global Escape model-value behavior changed");scriptHost->queueEscape();++phase;return;}
        if(phase==6){scriptHost->run(scriptHostDocument.get(),"host.lua");++phase;return;}
        if(phase==7){require(scriptHost->windowCount()==2,"Restart windows missing");scriptHostDocument=std::make_unique<Document>(3,1);++phase;return;}
        require(scriptHost->windowCount()==0&&!scriptHostClient->session(),"Target switch retained native windows");scriptHostTimer.stop();scriptHost.reset();scriptHostClient.reset();scriptHostRuntime.reset();desktop.approved=true;desktop.closeWindow(editor);
      }catch(const std::exception& e){std::ofstream("native-script-window-host-error.txt")<<e.what();std::exit(1);}});scriptHostTimer.start();
    }
    const bool canvasResizeCheck=argc>1&&std::string(argv[1])=="--canvas-resize-check";
    const bool scriptReportCheck=argc>1&&std::string(argv[1])=="--script-report-check";ui::Timer scriptReportTimer(180,editor);
    if(scriptReportCheck){scriptReportTimer.Tick.connect([&]{scriptReportTimer.stop();try{
      Skin icons;for(const auto suffix:{"","-disabled"})icons.assets.patches[std::string("close")+suffix]=importSkinPng(assets/"utility-icons"/(std::string("close")+suffix+".png"),32);
      ScriptNumberEntry number(font,skin,1.5,-2,3,.25);int changes=0,commits=0;number.changed=[&](double){++changes;};number.committed=[&]{++commits;};number.setText("2.25");number.Change();if(number.value()!=2.25||changes!=1||commits)throw std::runtime_error("Script number live draft");number.setText("1+0.5");number.Change();if(number.value()!=2.25)throw std::runtime_error("Script number expression evaluated early");number.commitExpression();number.accept();if(number.value()!=1.5||commits)throw std::runtime_error("Script number expression commit");number.blur();if(commits!=1)throw std::runtime_error("Script number blur callback");number.setText("9");number.Change();if(number.value()!=3)throw std::runtime_error("Script number bounds");
      number.setText("invalid");number.accept();if(number.value()!=3)throw std::runtime_error("Script number invalid draft mutated value");number.setText("-1.5");number.Change();number.adjustNumber(1);if(number.value()!=-1.25)throw std::runtime_error("Script number decimal step");
      ScriptRangeSlider range(font,skin,.5,-1,2,.25);int releases=0;range.released=[&]{++releases;};ui::KeyMessage right(ui::kKeyDownMessage,ui::kKeyRight,ui::kKeyNoneModifier,0,0);range.onProcessMessage(&right);if(range.domainValue()!=.75||releases)throw std::runtime_error("Script decimal slider keyboard");ui::KeyMessage end(ui::kKeyDownMessage,ui::kKeyEnd,ui::kKeyNoneModifier,0,0);range.onProcessMessage(&end);if(range.domainValue()!=2)throw std::runtime_error("Script slider bound");
      {using namespace winrt::Windows::Data::Json;JsonObject model;model.Insert(L"id",JsonValue::CreateStringValue(L"native-window"));model.Insert(L"title",JsonValue::CreateStringValue(L"脚本控件"));JsonArray controls;for(auto kind:{L"entry",L"number",L"slider",L"check",L"radio",L"combobox",L"color",L"label",L"separator",L"button"}){JsonObject c;c.Insert(L"id",JsonValue::CreateStringValue(kind));c.Insert(L"dataKey",JsonValue::CreateStringValue(kind));c.Insert(L"kind",JsonValue::CreateStringValue(kind));c.Insert(L"label",JsonValue::CreateStringValue(kind));c.Insert(L"text",JsonValue::CreateStringValue(L"示例"));c.Insert(L"enabled",JsonValue::CreateBooleanValue(true));c.Insert(L"visible",JsonValue::CreateBooleanValue(true));c.Insert(L"min",JsonValue::CreateNumberValue(0));c.Insert(L"max",JsonValue::CreateNumberValue(10));c.Insert(L"step",JsonValue::CreateNumberValue(.25));JsonArray options;options.Append(JsonValue::CreateStringValue(L"A"));options.Append(JsonValue::CreateStringValue(L"B"));c.Insert(L"options",options);c.Insert(L"value",JsonValue::CreateNumberValue(2.5));if(std::wstring(kind)==L"entry"||std::wstring(kind)==L"combobox")c.Insert(L"value",JsonValue::CreateStringValue(L"A"));if(std::wstring(kind)==L"check"||std::wstring(kind)==L"radio")c.Insert(L"value",JsonValue::CreateBooleanValue(false));controls.Append(c);}model.Insert(L"controls",controls);std::string action;ScriptDialogWindow popup(font,skin,icons,winrt::to_string(model.Stringify()),assets.parent_path()/"script-color-smoke-size.txt",[&](std::string s){action=std::move(s);});const auto view=editor->display()->bounds();popup.setBounds({view.x+100,view.y+100,420*uiScale,popup.preferredHeight()*uiScale});ui::Timer check(120,&popup);int phase=0;check.Tick.connect([&]{if(phase++==0)return;if(phase==2){writeSmokeFrame(popup.display()->nativeSurface().get(),assets.parent_path()/"script-controls-dialog-smoke.bmp");popup.verify();if(action.empty()||JsonObject::Parse(winrt::to_hstring(action)).GetNamedObject(L"values").GetNamedString(L"entry")!=L"native draft")throw std::runtime_error("Native script window action draft");}else{check.stop();popup.closeFromHost();}});check.start();popup.openWindowInForeground();check.stop();}
      script::RunSummary summary;summary.fileName="报告🌙.lua";summary.filePath="C:/scripts/报告🌙.lua";summary.transactionCount=3;summary.changedPixelCount=42;summary.elapsedMs=1.25;for(int i=0;i<500;++i)summary.output.push_back("Line "+std::to_string(i)+": script output with Unicode 月相");
      for(int mode=0;mode<2;++mode){ScriptReportDialog popup(font,skin,icons,mode?std::nullopt:std::optional<script::RunSummary>(summary),"Lua error\nstack trace: test.lua:4");const auto view=editor->display()->bounds();popup.setBounds({view.x+(view.w-500*uiScale)/2,view.y+(view.h-260*uiScale)/2,500*uiScale,260*uiScale});ui::Timer check(120,&popup);check.Tick.connect([&]{check.stop();popup.verifyLayout();writeSmokeFrame(popup.display()->nativeSurface().get(),assets.parent_path()/(mode?"script-error-dialog-smoke.bmp":"script-report-dialog-smoke.bmp"));popup.verifyClose();});check.start();popup.openWindowInForeground();check.stop();}
      desktop.approved=true;desktop.closeWindow(editor);
    }catch(const std::exception& e){std::ofstream("native-script-report-error.txt")<<e.what();std::exit(1);}});scriptReportTimer.start();}
    const bool outlineCheck=argc>1&&std::string(argv[1])=="--outline-check";ui::Timer outlineTimer(180,editor);if(outlineCheck){outlineTimer.Tick.connect([&]{outlineTimer.stop();try{editor->smokeOutline();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-outline-error.txt")<<e.what();std::exit(1);}});outlineTimer.start();}
    const bool tileRepeatCheck=argc>1&&std::string(argv[1])=="--tile-repeat-check";ui::Timer tileRepeatTimer(180,editor);if(tileRepeatCheck){tileRepeatTimer.Tick.connect([&]{tileRepeatTimer.stop();try{editor->smokeTileRepeat();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-tile-repeat-error.txt")<<e.what();std::exit(1);}});tileRepeatTimer.start();}
    const bool quickCommandCheck=argc>1&&std::string(argv[1])=="--quick-command-check";ui::Timer quickCommandTimer(180,editor);if(quickCommandCheck){quickCommandTimer.Tick.connect([&]{quickCommandTimer.stop();try{editor->smokeQuickCommands();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-quick-command-error.txt")<<e.what();std::exit(1);}});quickCommandTimer.start();}
    const bool imageResizeCheck=argc>1&&std::string(argv[1])=="--image-resize-check";ui::Timer imageResizeTimer(180,editor);if(imageResizeCheck){imageResizeTimer.Tick.connect([&]{imageResizeTimer.stop();try{editor->smokeImageResize();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-image-resize-error.txt")<<e.what();std::exit(1);}});imageResizeTimer.start();}
    const bool layerColorPresetsCheck=argc>1&&std::string(argv[1])=="--layer-color-presets-check";
    ui::Timer layerColorPresetsTimer(180,editor);
    if(layerColorPresetsCheck){layerColorPresetsTimer.Tick.connect([&]{layerColorPresetsTimer.stop();try{editor->smokeLayerColorPresets();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-layer-color-presets-error.txt")<<e.what();std::exit(1);}});layerColorPresetsTimer.start();}
    const bool alignmentCheck=argc>1&&std::string(argv[1])=="--alignment-check";
    ui::Timer alignmentTimer(180,editor);
    if(alignmentCheck){alignmentTimer.Tick.connect([&]{alignmentTimer.stop();try{editor->smokeAlignment();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-alignment-error.txt")<<e.what();std::exit(1);}});alignmentTimer.start();}
    const bool referencePanelCheck=argc>1&&std::string(argv[1])=="--reference-panel-check";
    ui::Timer referencePanelTimer(180,editor);
    if(referencePanelCheck){referencePanelTimer.Tick.connect([&]{referencePanelTimer.stop();try{editor->smokeReferenceImages();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-reference-panel-error.txt")<<e.what();std::exit(1);}});referencePanelTimer.start();}
    const bool linkedLayerCheck=argc>1&&std::string(argv[1])=="--linked-layers-check";ui::Timer linkedLayerTimer(180,editor);if(linkedLayerCheck){linkedLayerTimer.Tick.connect([&]{linkedLayerTimer.stop();try{editor->smokeLinkedLayers();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-linked-layers-error.txt")<<e.what();std::exit(1);}});linkedLayerTimer.start();}
    const bool textRasterCheck=argc>1&&std::string(argv[1])=="--text-rasterization-check";ui::Timer textRasterTimer(180,editor);if(textRasterCheck){textRasterTimer.Tick.connect([&]{textRasterTimer.stop();try{editor->smokeTextRasterization();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-text-rasterization-error.txt")<<e.what();std::exit(1);}});textRasterTimer.start();}
    const bool textToolCheck=argc>1&&std::string(argv[1])=="--text-tool-check";ui::Timer textToolTimer(180,editor);if(textToolCheck){textToolTimer.Tick.connect([&]{textToolTimer.stop();try{editor->smokeTextTool();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-text-tool-error.txt")<<e.what();std::exit(1);}});textToolTimer.start();}
    const bool sliceCheck=argc>1&&std::string(argv[1])=="--slice-check";ui::Timer sliceTimer(180,editor);if(sliceCheck){sliceTimer.Tick.connect([&]{sliceTimer.stop();try{editor->smokeSlices();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-slice-error.txt")<<e.what();std::exit(1);}});sliceTimer.start();}
    const bool rotationCheck=argc>1&&std::string(argv[1])=="--view-rotation-check";ui::Timer rotationTimer(180,editor);if(rotationCheck){rotationTimer.Tick.connect([&]{rotationTimer.stop();try{editor->smokeViewRotation();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-view-rotation-error.txt")<<e.what();std::exit(1);}});rotationTimer.start();}
    const bool diagnosticsCheck=argc>1&&std::string(argv[1])=="--diagnostics-check";ui::Timer diagnosticsTimer(180,editor);if(diagnosticsCheck){diagnosticsTimer.Tick.connect([&]{diagnosticsTimer.stop();try{editor->smokeDiagnostics();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-diagnostics-error.txt")<<e.what();std::exit(1);}});diagnosticsTimer.start();}
    const bool rollbackCheck=argc>1&&std::string(argv[1])=="--project-rollback-check";ui::Timer rollbackTimer(180,editor);if(rollbackCheck){rollbackTimer.Tick.connect([&]{rollbackTimer.stop();try{SetEnvironmentVariableW(L"MOONSPRITE_ROLLBACK_SMOKE",L"1");editor->showProjectRollback();SetEnvironmentVariableW(L"MOONSPRITE_ROLLBACK_SMOKE",nullptr);desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-project-rollback-error.txt")<<e.what();std::exit(1);}});rollbackTimer.start();}
    const bool backgroundLayerCheck=argc>1&&std::string(argv[1])=="--background-layer-check";ui::Timer backgroundLayerTimer(180,editor);if(backgroundLayerCheck){backgroundLayerTimer.Tick.connect([&]{backgroundLayerTimer.stop();try{editor->smokeBackgroundLayers();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-background-layer-error.txt")<<e.what();std::exit(1);}});backgroundLayerTimer.start();}
    const bool projectInformationCheck=argc>1&&std::string(argv[1])=="--project-information-check";ui::Timer projectInformationTimer(180,editor);if(projectInformationCheck){projectInformationTimer.Tick.connect([&]{projectInformationTimer.stop();try{editor->smokeProjectInformation();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-project-information-error.txt")<<e.what();std::exit(1);}});projectInformationTimer.start();}
    const bool helpCheck=argc>1&&std::string(argv[1])=="--help-check";ui::Timer helpTimer(180,editor);if(helpCheck){helpTimer.Tick.connect([&]{helpTimer.stop();try{editor->smokeHelp();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-help-error.txt")<<e.what();std::exit(1);}});helpTimer.start();}
    const bool tabletAssistCheck=argc>1&&std::string(argv[1])=="--tablet-assist-check";ui::Timer tabletAssistTimer(180,editor);if(tabletAssistCheck){tabletAssistTimer.Tick.connect([&]{tabletAssistTimer.stop();try{editor->smokeTabletAssist();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-tablet-assist-error.txt")<<e.what();std::exit(1);}});tabletAssistTimer.start();}
    const bool brushLibraryCheck=argc>1&&std::string(argv[1])=="--brush-library-panel-check";ui::Timer brushLibraryTimer(180,editor);if(brushLibraryCheck){brushLibraryTimer.Tick.connect([&]{brushLibraryTimer.stop();try{editor->smokeBrushLibraryPanel();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-brush-library-panel-error.txt")<<e.what();std::exit(1);}});brushLibraryTimer.start();}
    const bool tilesetManagementCheck=argc>1&&std::string(argv[1])=="--tileset-management-check";ui::Timer tilesetManagementTimer(180,editor);if(tilesetManagementCheck){tilesetManagementTimer.Tick.connect([&]{tilesetManagementTimer.stop();try{if(std::wstring(GetCommandLineW()).find(L"--grid-transform-entry-only")!=std::wstring::npos)editor->smokeTilemapSelectionDelete();else{editor->smokeTilesetManagement();editor->smokeTilemapFill();editor->smokeTilemapPreview();editor->smokeTilemapSelectionDelete();}desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-tileset-management-error.txt")<<e.what();std::exit(1);}});tilesetManagementTimer.start();}

    const bool layerMoveCheck=argc>1&&std::string(argv[1])=="--layer-move-check";
    ui::Timer layerMoveTimer(180,editor);
    if(layerMoveCheck){layerMoveTimer.Tick.connect([&]{layerMoveTimer.stop();try{editor->smokeLayerMove();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-layer-move-error.txt")<<e.what();std::exit(1);}});layerMoveTimer.start();}
    const bool shortcutInputsCheck=argc>1&&std::string(argv[1])=="--shortcuts-input-check";ui::Timer shortcutInputsTimer(180,editor);if(shortcutInputsCheck){shortcutInputsTimer.Tick.connect([&]{shortcutInputsTimer.stop();try{editor->smokeShortcutInputs();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-shortcuts-input-error.txt")<<e.what();std::exit(1);}});shortcutInputsTimer.start();}
    const bool shortcutsCheck=argc>1&&std::string(argv[1])=="--shortcuts-check";
    ui::Timer shortcutsTimer(180,editor);
    if(shortcutsCheck){shortcutsTimer.Tick.connect([&]{shortcutsTimer.stop();try{editor->smokeShortcutSettings();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-shortcuts-error.txt")<<e.what();std::exit(1);}});shortcutsTimer.start();}
    const bool previewPanelCheck=argc>1&&std::string(argv[1])=="--preview-panel-check";ui::Timer previewPanelTimer(180,editor);if(previewPanelCheck){previewPanelTimer.Tick.connect([&]{previewPanelTimer.stop();try{editor->smokePreviewPanel();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-preview-panel-error.txt")<<e.what();std::exit(1);}});previewPanelTimer.start();}
    const bool historyPanelCheck=argc>1&&std::string(argv[1])=="--history-panel-check";
    ui::Timer historyPanelTimer(180,editor);
    const bool usageCheck=argc>1&&std::string(argv[1])=="--usage-statistics-check";ui::Timer usageTimer(140,editor);if(usageCheck){usageTimer.Tick.connect([&]{usageTimer.stop();try{editor->smokeUsageStatistics();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-usage-statistics-error.txt")<<e.what();std::exit(1);}});usageTimer.start();}
    if(historyPanelCheck){historyPanelTimer.Tick.connect([&]{historyPanelTimer.stop();try{editor->smokeHistoryPanel();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-history-panel-error.txt")<<e.what();std::exit(1);}});historyPanelTimer.start();}
    const bool filterPresetsCheck=argc>1&&std::string(argv[1])=="--filter-presets-check";
    ui::Timer filterPresetsTimer(180,editor);
    if(filterPresetsCheck){filterPresetsTimer.Tick.connect([&]{filterPresetsTimer.stop();try{editor->smokeFilterPresets();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-filter-presets-error.txt")<<e.what();std::exit(1);}});filterPresetsTimer.start();}
    ui::Timer canvasResizeTimer(180,editor);
    if(canvasResizeCheck){canvasResizeTimer.Tick.connect([&]{canvasResizeTimer.stop();try{editor->smokeTemporaryBrushCapture();editor->smokeCanvasResize();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-canvas-resize-error.txt")<<e.what();std::exit(1);}});canvasResizeTimer.start();}

    const bool windowInputCheck=argc>1 && std::string(argv[1])=="--window-input-check";

    ui::Timer windowInputTimer(200,editor);int windowInputPhase=0;

    if(windowInputCheck){windowInputTimer.Tick.connect([&]{try{

      windowInputTimer.stop();

      const auto hwnd=static_cast<HWND>(window->nativeHandle());

      if(windowInputPhase%2==0){

        const int variant=windowInputPhase/2;

        if(variant==2)ShowWindow(hwnd,SW_MAXIMIZE);

        else {ShowWindow(hwnd,SW_RESTORE);const gfx::Point positions[]{gfx::Point(137,93),gfx::Point(-40,120),gfx::Point(),gfx::Point(311,147)};RECT rc{0,0,720,600};AdjustWindowRectEx(&rc,DWORD(GetWindowLongPtrW(hwnd,GWL_STYLE)),FALSE,DWORD(GetWindowLongPtrW(hwnd,GWL_EXSTYLE)));SetWindowPos(hwnd,nullptr,positions[variant].x,positions[variant].y,rc.right-rc.left,rc.bottom-rc.top,SWP_NOZORDER|SWP_NOACTIVATE);}

      }else {

        editor->smokeWindowInput(cursors);

        writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/("window-input-"+std::to_string(windowInputPhase/2)+".bmp"));

        if(windowInputPhase==7){windowInputTimer.stop();desktop.approved=true;desktop.closeWindow(editor);}

      }

      ++windowInputPhase;if(windowInputPhase<8)windowInputTimer.start();

    }catch(const std::exception& e){std::ofstream("native-window-input-error.txt")<<e.what();std::exit(1);}});windowInputTimer.start();}

    const bool modalCheck=argc>1 && std::string(argv[1])=="--modal-layout-check";

    const bool workspaceCheck=modalCheck || (argc>1 && std::string(argv[1])=="--workspace-check");
    const bool toolParameterDraftCheck=argc>1 && std::string(argv[1])=="--tool-parameter-drafts-only";
    const bool dynamicsDraftCheck=argc>1 && std::string(argv[1])=="--tool-dynamics-only";
    const bool fillDraftCheck=argc>1 && std::string(argv[1])=="--fill-parameter-drafts-only";
    const bool selectionDraftCheck=argc>1 && std::string(argv[1])=="--selection-transform-drafts-only";
    // toolRailCheck is parsed before Editor construction so workspace restore can be skipped.
    const bool magicEraserCheck=argc>1 && std::string(argv[1])=="--magic-eraser-only";

    const bool paletteMouseCheck=argc>1 && std::string(argv[1])=="--palette-mouse-check";

    const bool selectionCheck=argc>1 && std::string(argv[1])=="--selection-check";

    const bool homeCheck=argc>1 && std::string(argv[1])=="--home-check";

    ui::Timer workspaceTimer(400,editor);int workspacePhase=0;

    std::vector<gfx::Color> previewFrame;

    auto framePixels=[&]{

      auto surface=window->surface();os::SurfaceLock lock(surface);

      std::vector<gfx::Color> pixels;pixels.reserve(surface->width()*surface->height());

      for(int y=0;y<surface->height();++y)for(int x=0;x<surface->width();++x)pixels.push_back(surface->getPixel(x,y));

      return pixels;

    };

    const bool paletteGrowthCheck=argc>1&&std::string(argv[1])=="--palette-growth-check";ui::Timer paletteGrowthTimer(180,editor);int paletteGrowthPhase=0;

    if(paletteGrowthCheck){paletteGrowthTimer.Tick.connect([&]{try{const auto hwnd=static_cast<HWND>(window->nativeHandle());switch(paletteGrowthPhase++){case 0:editor->preparePaletteGrowthBlur();break;case 1:SendMessageW(hwnd,WM_ACTIVATE,WA_INACTIVE,0);break;case 2:editor->verifyPaletteGrowthBlur();SendMessageW(hwnd,WM_ACTIVATE,WA_CLICKACTIVE,0);paletteGrowthTimer.stop();desktop.approved=true;desktop.closeWindow(editor);break;}}catch(const std::exception& e){std::ofstream("native-palette-growth-error.txt")<<e.what();std::exit(1);}});paletteGrowthTimer.start();}

    const bool paletteWindowBlurCheck=argc>1&&std::string(argv[1])=="--palette-window-blur-check";ui::Timer paletteBlurTimer(180,editor);int paletteBlurPhase=0;

    if(paletteWindowBlurCheck){paletteBlurTimer.Tick.connect([&]{try{const auto hwnd=static_cast<HWND>(window->nativeHandle());switch(paletteBlurPhase++){case 0:editor->setupPaletteWindowBlur();break;case 1:editor->preparePaletteWindowBlur(true);SendMessageW(hwnd,WM_ACTIVATE,WA_INACTIVE,0);break;case 2:editor->verifyPaletteWindowBlur(true);SendMessageW(hwnd,WM_ACTIVATE,WA_CLICKACTIVE,0);editor->setupPaletteWindowBlur();break;case 3:editor->preparePaletteWindowBlur(false);SendMessageW(hwnd,WM_ACTIVATE,WA_INACTIVE,0);break;case 4:editor->verifyPaletteWindowBlur(false);SendMessageW(hwnd,WM_ACTIVATE,WA_CLICKACTIVE,0);paletteBlurTimer.stop();desktop.approved=true;desktop.closeWindow(editor);break;}}catch(const std::exception& e){std::ofstream("native-palette-window-blur-error.txt")<<e.what();std::exit(1);}});paletteBlurTimer.start();}

    const bool focusResumeCheck=argc>1 && std::string(argv[1])=="--focus-resume-check";

    ui::Timer focusResumeTimer(150,editor);int focusResumePhase=0;

    std::vector<gfx::Color> focusResumeFrame;

    if(focusResumeCheck){focusResumeTimer.Tick.connect([&]{try{

      if(focusResumePhase==0){editor->prepareFocusResumeCheck();}

      else if(focusResumePhase==1){focusResumeFrame=framePixels();}

      else if(focusResumePhase%2==0){

        const auto hwnd=static_cast<HWND>(window->nativeHandle());

        SendMessageW(hwnd,WM_ACTIVATE,WA_INACTIVE,0);

        SendMessageW(hwnd,WM_ACTIVATE,WA_CLICKACTIVE,0);

      }else {

        if(framePixels()!=focusResumeFrame)throw std::runtime_error("Focus resume changed retained framebuffer pixels");

        if(focusResumePhase==9){focusResumeTimer.stop();desktop.approved=true;desktop.closeWindow(editor);}

      }

      ++focusResumePhase;

    }catch(const std::exception& e){std::ofstream("native-focus-resume-error.txt")<<e.what();std::exit(1);}});focusResumeTimer.start();}

    if(workspaceCheck || toolParameterDraftCheck || dynamicsDraftCheck || fillDraftCheck || selectionDraftCheck || magicEraserCheck || toolRailCheck || paletteMouseCheck || homeCheck || selectionCheck)workspaceTimer.Tick.connect([&]{try{

      // Popup checks run nested manager loops. Do not let the next test phase

      // run inside a still-open foreground menu and falsely reject capture.

      workspaceTimer.stop();

      struct RestartTick {ui::Timer& timer;bool again=true;~RestartTick(){if(again)timer.start();}} restart{workspaceTimer};

      if(workspacePhase++==0){
        if(toolParameterDraftCheck){editor->smokeToolParameterDrafts();restart.again=false;workspaceTimer.stop();desktop.approved=true;desktop.closeWindow(editor);return;}
        if(dynamicsDraftCheck){editor->smokeBrushDynamicsDraft();restart.again=false;workspaceTimer.stop();desktop.approved=true;desktop.closeWindow(editor);return;}
        if(fillDraftCheck){editor->smokeFillParameterDrafts();restart.again=false;workspaceTimer.stop();desktop.approved=true;desktop.closeWindow(editor);return;}
        if(selectionDraftCheck){editor->smokeSelectionTransformDraftRoute();restart.again=false;workspaceTimer.stop();desktop.approved=true;desktop.closeWindow(editor);return;}
        if(magicEraserCheck){editor->smokeMagicEraser();restart.again=false;workspaceTimer.stop();desktop.approved=true;desktop.closeWindow(editor);return;}
        if(toolRailCheck){
          // Filters must ignore queued focus payloads after their recipient dies.
          auto temporary=new ui::Widget(ui::kGenericWidget);
          ui::FocusMessage obsolete(ui::kFocusEnterMessage,nullptr,temporary);
          obsolete.setFromFilter(true);
          delete temporary;
          manager.onProcessMessage(&obsolete);
          editor->smokeToolRailMatrix();restart.again=false;workspaceTimer.stop();desktop.approved=true;desktop.closeWindow(editor);return;}
        if(workspaceCheck&&std::wstring(GetCommandLineW()).find(L"--named-workspace-only")!=std::wstring::npos){editor->smokeWorkspace();restart.again=false;workspaceTimer.stop();desktop.approved=true;desktop.closeWindow(editor);return;}

        if(selectionCheck){editor->smokeSelectionTools();editor->smokeSelectionDisplay();return;}

        if(homeCheck){editor->smokeHome();return;}

        // Match the underlying manager's real message types, including

        // display-less Leave and early Move before display assignment.

        editor->smokeTimelineFirstPaint(window->surface());

        editor->smokePaletteMouse([&](ui::Message* message){manager.onProcessMessage(message);});

        if(workspaceCheck){editor->smokeWorkspace();if(modalCheck)editor->smokeWorkspaceModalPreview();}return;

      }

      if(workspacePhase==2)writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/(selectionCheck?"selection-smoke.bmp":homeCheck?"home-smoke.bmp":paletteMouseCheck?"palette-mouse-smoke.bmp":"workspace-smoke.bmp"));

      if(workspaceCheck && !modalCheck && workspacePhase==2){editor->smokePreviewRepaintStep(0);editor->smokePreviewBatchFlush([&]{ui::Message cursor(ui::kSetCursorMessage);manager.onProcessMessage(&cursor);});return;}

      if(workspaceCheck && workspacePhase>=3 && workspacePhase<=14) {

        if(workspacePhase%2==1){editor->smokeFinishPreviewRepaintStep();previewFrame=framePixels();writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"preview-incremental.bmp");editor->invalidate();return;}

        if(previewFrame!=framePixels()){writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"preview-full.bmp");throw std::runtime_error("Preview move/resize left pixels differing from full repaint at phase "+std::to_string(workspacePhase));}

        if(workspacePhase<14){editor->smokePreviewRepaintStep((workspacePhase-2)/2);editor->smokePreviewBatchFlush([&]{ui::Message cursor(ui::kSetCursorMessage);manager.onProcessMessage(&cursor);});}

        else editor->smokePrepareColumnRepaint();

        return;

      }

      if(workspaceCheck && !modalCheck && workspacePhase>=15 && workspacePhase<=19){

        if(workspacePhase==15){editor->smokeColumnRepaintStep(0);return;}

        if(workspacePhase==16 || workspacePhase==18){previewFrame=framePixels();writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/(workspacePhase==16?"column-move-incremental.bmp":"column-resize-incremental.bmp"));editor->invalidate();return;}

        if(previewFrame!=framePixels())throw std::runtime_error("Floating column incremental repaint differs from full repaint at phase "+std::to_string(workspacePhase));

        if(workspacePhase==17)editor->smokeColumnRepaintStep(10);else editor->smokePrepareDockSplitRepaint();return;

      }

      if(workspaceCheck && !modalCheck && workspacePhase>=20 && workspacePhase<=22){

        if(workspacePhase==20){editor->smokeDockSplitShrink();return;}

        if(workspacePhase==21){previewFrame=framePixels();writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"dock-split-shrink-incremental.bmp");editor->invalidate();return;}

        if(previewFrame!=framePixels())throw std::runtime_error("Dock split shrink left pixels differing from full repaint");

        editor->smokePrepareDockLabelRepaint();return;

      }

      if(workspaceCheck && !modalCheck && workspacePhase>=23 && workspacePhase<=27){

        if(workspacePhase==23){editor->smokeMoveDockLabel({33,113});return;}

        if(workspacePhase==24 || workspacePhase==26){previewFrame=framePixels();writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"dock-label-incremental.bmp");editor->invalidate();return;}

        if(previewFrame!=framePixels())throw std::runtime_error("Dock label drag left background/material trails at phase "+std::to_string(workspacePhase));

        if(workspacePhase==25)editor->smokeMoveDockLabel({-11,77});else{editor->smokeFinishDockLabelRepaint();editor->smokePrepareMergedDockLabelRepaint();}return;

      }

      if(workspaceCheck && !modalCheck && workspacePhase>=28 && workspacePhase<=32){

        if(workspacePhase==28){editor->smokeMoveMergedDockLabel(80);return;}

        if(workspacePhase==29 || workspacePhase==31){previewFrame=framePixels();writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"merged-tab-strip-incremental.bmp");editor->invalidate();return;}

        if(previewFrame!=framePixels())throw std::runtime_error("Merged preview tab strip retained drag feedback pixels at phase "+std::to_string(workspacePhase));

        if(workspacePhase==30)editor->smokeMoveMergedDockLabel(-80);else{editor->smokeFinishDockLabelRepaint();editor->smokePrepareFloatingPreviewRepaint();}return;

      }

      if(workspaceCheck && !modalCheck && workspacePhase>=33 && workspacePhase<=56){

        const int stage=(workspacePhase-33)%3;

        if(stage==0){editor->smokeFloatingPreviewRepaintStep((workspacePhase-33)/3);return;}

        if(stage==1){previewFrame=framePixels();writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"floating-preview-continuous-incremental.bmp");editor->invalidate();return;}

        if(previewFrame!=framePixels()){writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"floating-preview-continuous-full.bmp");throw std::runtime_error("Floating preview continuous move retained background pixels at phase "+std::to_string(workspacePhase));}

        if(workspacePhase==56)editor->smokeWorkspaceModalPreview();return;

      }

      if(workspaceCheck)writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"workspace-modal-smoke.bmp");

      restart.again=false;workspaceTimer.stop();desktop.approved=true;desktop.closeWindow(editor);

    }catch(const std::exception& e){std::ofstream("native-workspace-error.txt")<<e.what();std::exit(1);}});

    if(workspaceCheck || toolParameterDraftCheck || dynamicsDraftCheck || fillDraftCheck || selectionDraftCheck || magicEraserCheck || toolRailCheck || paletteMouseCheck || homeCheck || selectionCheck)workspaceTimer.start();

    const bool smoke=argc>1 && std::string(argv[1])=="--smoke";

    ui::Timer timer(400,editor);

    int phase=0;

    if(smoke) {timer.Tick.connect([&]{try{

      if(phase++==0) {timer.stop();editor->smokeInteraction();editor->smokeResize();editor->smokeStrokePerformance();if(const wchar_t* sample=_wgetenv(L"MOONSPRITE_IMPORT_SMOKE")){editor->smokeOpen(std::filesystem::path(sample));editor->smokeSave(std::filesystem::path(sample).parent_path());editor->smokeRecovery(std::filesystem::path(sample).parent_path());}editor->smokeMenu(0);timer.start();return;}

      if(phase==2) {

        writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"menu-smoke.bmp");

        editor->smokeMenu(1);return;

      }

      if(phase<10)editor->smokeMenu(2);

      if(phase==3) {

        writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"smoke.bmp");

        editor->smokePreviewPanel();return;

      }

      if(phase==4) {

        writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"preview-smoke.bmp");

        editor->smokeRange(false);return;

      }

      if(phase==5) {

        writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"range-normal-smoke.bmp");editor->smokeRange();return;

      }

      if(phase==6) {

        writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"range-smoke.bmp");editor->smokeColorPicker();return;

      }

      if(phase==7) {

        writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"color-picker-smoke.bmp");editor->smokePickerLightBackground();return;

      }

      if(phase==8) {

        writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"color-roles-alpha-smoke.bmp");editor->smokeDialog();return;

      }

      if(phase==9){writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"dialog-smoke.bmp");editor->smokeDismissDialog();return;}

      if(phase>=10 && phase<=23){const int index=(phase-10)/2;if(phase%2==0)editor->smokeMenu(0,index);else{writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/("menu-full-"+std::to_string(index)+".bmp"));editor->smokeMenu(1,index);}return;}

      timer.stop();

      desktop.approved=true;desktop.closeWindow(editor);

    }catch(const std::exception& e){std::fprintf(stderr,"%s\n",e.what());std::ofstream("native-smoke-error.txt")<<e.what();std::exit(1);}});timer.start();}

    const bool maskSelectionClipboardCheck=argc>1&&std::string(argv[1])=="--mask-selection-clipboard-check";
    ui::Timer maskSelectionClipboardTimer(180,editor);
    if(maskSelectionClipboardCheck){maskSelectionClipboardTimer.Tick.connect([&]{maskSelectionClipboardTimer.stop();try{editor->smokeMaskSelectionClipboard();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-mask-selection-clipboard-error.txt")<<e.what();std::exit(1);}});maskSelectionClipboardTimer.start();}
    const bool pendingGradientIoCheck=argc>1&&std::string(argv[1])=="--pending-gradient-io-check";
    ui::Timer pendingGradientIoTimer(180,editor);
    if(pendingGradientIoCheck){pendingGradientIoTimer.Tick.connect([&]{pendingGradientIoTimer.stop();try{editor->smokePendingGradientIo();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native/build/pending-gradient-io-error.txt")<<e.what();std::exit(1);}});pendingGradientIoTimer.start();}
    const bool nativeSaveCheck=argc>1&&(std::string(argv[1])=="--native-save-check"||std::string(argv[1])=="--backup-save-check");
    ui::Timer nativeSaveTimer(180,editor);
    if(nativeSaveCheck){nativeSaveTimer.Tick.connect([&]{nativeSaveTimer.stop();try{editor->smokeNativeSaveLifecycle();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native/build/native-save-error.txt")<<e.what();std::exit(1);}});nativeSaveTimer.start();}
    const bool largeImageIoCheck=argc>1&&std::string(argv[1])=="--large-image-io-check";
    ui::Timer largeImageIoTimer(180,editor);
    if(largeImageIoCheck){largeImageIoTimer.Tick.connect([&]{largeImageIoTimer.stop();try{editor->smokeLargeImageIo();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native/build/large-image-io-error.txt")<<e.what();std::exit(1);}});largeImageIoTimer.start();}
    const bool asepriteSaveCheck=argc>1&&std::string(argv[1])=="--aseprite-save-check";
    ui::Timer asepriteSaveTimer(180,editor);
    if(asepriteSaveCheck){asepriteSaveTimer.Tick.connect([&]{asepriteSaveTimer.stop();try{editor->smokeAsepriteSaveLifecycle();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-aseprite-save-error.txt")<<e.what();std::exit(1);}});asepriteSaveTimer.start();}
    const bool asepriteIoCheck=argc>1&&std::string(argv[1])=="--aseprite-io-check";
    ui::Timer asepriteIoTimer(180,editor);
    if(asepriteIoCheck){asepriteIoTimer.Tick.connect([&]{asepriteIoTimer.stop();try{editor->smokeAsepriteIo();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-aseprite-io-error.txt")<<e.what();std::exit(1);}});asepriteIoTimer.start();}
    const bool masksCheck=argc>1&&std::string(argv[1])=="--attached-masks-check";
    ui::Timer masksCheckTimer(200,editor);masksCheckTimer.Tick.connect([&]{masksCheckTimer.stop();try{editor->smokeAttachedMasks();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-attached-masks-error.txt")<<e.what();std::exit(1);}});if(masksCheck)masksCheckTimer.start();
    const bool clippingCheck=argc>1&&std::string(argv[1])=="--clipping-mask-check";ui::Timer clippingTimer(200,editor);if(clippingCheck){clippingTimer.Tick.connect([&]{clippingTimer.stop();try{editor->smokeClippingMask();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-clipping-mask-error.txt")<<e.what();std::exit(1);}});clippingTimer.start();}
    const bool maskResizeCheck=argc>1&&std::string(argv[1])=="--mask-resize-check";ui::Timer maskResizeTimer(200,editor);if(maskResizeCheck){maskResizeTimer.Tick.connect([&]{maskResizeTimer.stop();try{editor->smokeMaskResize();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-mask-resize-error.txt")<<e.what();std::exit(1);}});maskResizeTimer.start();}
    const bool sheetImportCheck=argc>1&&std::string(argv[1])=="--sheet-import-check";ui::Timer sheetImportTimer(200,editor);if(sheetImportCheck){sheetImportTimer.Tick.connect([&]{sheetImportTimer.stop();try{editor->smokeSheetImport();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-sheet-import-error.txt")<<e.what();std::exit(1);}});sheetImportTimer.start();}
    const bool homeRecoveryCheck=argc>1&&std::string(argv[1])=="--home-recovery-check";ui::Timer homeRecoveryTimer(220,editor);if(homeRecoveryCheck){homeRecoveryTimer.Tick.connect([&]{homeRecoveryTimer.stop();try{editor->smokeHomeRecoveries();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native/build/home-recovery-error.txt")<<e.what();std::exit(1);}});homeRecoveryTimer.start();}
    const bool recentProjectsCheck=argc>1&&std::string(argv[1])=="--recent-projects-check";ui::Timer recentProjectsTimer(220,editor);if(recentProjectsCheck){recentProjectsTimer.Tick.connect([&]{recentProjectsTimer.stop();try{editor->smokeRecentProjects();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-recent-projects-error.txt")<<e.what();std::exit(1);}});recentProjectsTimer.start();}
    const bool homeSectionsCheck=argc>1&&std::string(argv[1])=="--home-sections-check";ui::Timer homeSectionsTimer(220,editor);if(homeSectionsCheck){homeSectionsTimer.Tick.connect([&]{homeSectionsTimer.stop();try{editor->smokeHomeSections();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-home-sections-error.txt")<<e.what();std::exit(1);}});homeSectionsTimer.start();}
    const bool homeBannerCheck=argc>1&&std::string(argv[1])=="--home-banner-check";int homeBannerPhase=0;ui::Timer homeBannerTimer(220,editor);if(homeBannerCheck){homeBannerTimer.Tick.connect([&]{homeBannerTimer.stop();try{if(homeBannerPhase++==0){editor->smokeHomeBanner();homeBannerTimer.start();return;}writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"home-banner-smoke.bmp");desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-home-banner-error.txt")<<e.what();std::exit(1);}});homeBannerTimer.start();}
    const bool galleryCheck=argc>1&&std::string(argv[1])=="--gallery-check";int galleryPhase=0;ui::Timer galleryTimer(220,editor);if(galleryCheck){galleryTimer.Tick.connect([&]{galleryTimer.stop();try{if(galleryPhase++==0){editor->smokeGallery();galleryTimer.start();return;}writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"gallery-smoke.bmp");desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-gallery-error.txt")<<e.what();std::exit(1);}});galleryTimer.start();}
    const bool homeAnnouncementsCheck=argc>1&&std::string(argv[1])=="--home-announcements-check";int homeAnnouncementsPhase=0;ui::Timer homeAnnouncementsTimer(200,editor);if(homeAnnouncementsCheck){homeAnnouncementsTimer.Tick.connect([&]{homeAnnouncementsTimer.stop();try{if(homeAnnouncementsPhase==0){editor->smokeHomeAnnouncements(0);++homeAnnouncementsPhase;homeAnnouncementsTimer.start();return;}if(homeAnnouncementsPhase==1){writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"home-announcements-smoke.bmp");editor->smokeHomeAnnouncements(1);++homeAnnouncementsPhase;homeAnnouncementsTimer.start();return;}writeSmokeFrame(window->surface(),std::filesystem::u8path(argv[0]).parent_path()/"home-announcements-short-smoke.bmp");desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-home-announcements-error.txt")<<e.what();std::exit(1);}});homeAnnouncementsTimer.start();}
    const bool releaseNotesCheck=argc>1&&std::string(argv[1])=="--release-notes-check";
    bool releaseAutomation=false;for(int i=1;i<argc;++i)if(std::string(argv[i]).rfind("--",0)==0)releaseAutomation=true;
    ui::Timer releaseNoticeTimer(240,editor);releaseNoticeTimer.Tick.connect([&]{releaseNoticeTimer.stop();if(releaseNotesCheck){try{editor->smokeReleaseNotes();desktop.approved=true;desktop.closeWindow(editor);}catch(const std::exception& e){std::ofstream("native-release-notes-error.txt")<<e.what();std::exit(1);}}else if(!releaseAutomation){editor->showReleaseNoticeOnce();}});if(releaseNotesCheck||!releaseAutomation)releaseNoticeTimer.start();
    manager.run();

    manager.removeMessageFilter(ui::kSetCursorMessage,&manager);manager.removeMessageFilter(ui::kFocusLeaveMessage,&manager);

    for(const auto type:{ui::kMouseDownMessage,ui::kMouseMoveMessage,ui::kMouseEnterMessage,ui::kMouseLeaveMessage,ui::kMouseWheelMessage}) manager.removeMessageFilter(type,&manager);

    return 0;

  } catch(const std::exception& e) {
    diagnostics::recordGlobal("error","native.unhandled",{{"message",std::string(e.what())}});if(auto recorder=diagnostics::global())recorder->flush();

    if(argc>1 && (std::string(argv[1])=="--deselect-check" || std::string(argv[1])=="--focus-resume-check" || std::string(argv[1])=="--selection-check" || std::string(argv[1])=="--smoke" || std::string(argv[1])=="--home-check" || std::string(argv[1])=="--palette-mouse-check" || std::string(argv[1])=="--workspace-check" || std::string(argv[1])=="--layer-context-check" || std::string(argv[1])=="--layers-check" || std::string(argv[1])=="--skin-resize-check" || std::string(argv[1])=="--animation-check" || std::string(argv[1])=="--docking-check")) {std::ofstream("native-smoke-error.txt")<<e.what();std::fprintf(stderr,"%s\n",e.what());return 1;}

    MessageBoxA(nullptr,e.what(),"MoonSprite native startup error",MB_OK|MB_ICONERROR); return 1;

  }

}
