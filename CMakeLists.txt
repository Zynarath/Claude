cmake_minimum_required(VERSION 3.16)
project(TheTower LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release)
endif()

option(TOWER_BUILD_SIM "Build the headless balance simulator" OFF)

# raylib is downloaded automatically at configure time.
include(FetchContent)
set(BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(BUILD_GAMES OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
FetchContent_Declare(
  raylib
  GIT_REPOSITORY https://github.com/raysan5/raylib.git
  GIT_TAG 5.5
  GIT_SHALLOW TRUE
  GIT_PROGRESS TRUE)
FetchContent_MakeAvailable(raylib)

add_library(tower_core STATIC src/Stats.cpp src/Battle.cpp)
target_include_directories(tower_core PUBLIC src)

add_executable(TheTower src/main.cpp src/Ui.cpp src/Save.cpp)
target_link_libraries(TheTower PRIVATE tower_core raylib)

if(WIN32)
  # No console window, and a self-contained .exe with no extra DLLs.
  set_target_properties(TheTower PROPERTIES WIN32_EXECUTABLE ON)
  if(MSVC)
    set_property(TARGET TheTower tower_core raylib PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
    target_link_options(TheTower PRIVATE /ENTRY:mainCRTStartup)
  else()
    target_link_options(TheTower PRIVATE -static -static-libgcc -static-libstdc++)
  endif()
endif()

if(TOWER_BUILD_SIM)
  add_executable(tower_sim tools/balance_sim.cpp)
  target_link_libraries(tower_sim PRIVATE tower_core)
endif()
