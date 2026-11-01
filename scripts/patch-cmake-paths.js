/* global __dirname */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function createJunction(linkPath, targetPath) {
  if (fs.existsSync(targetPath) && !fs.existsSync(linkPath)) {
    try {
      if (process.platform === 'win32') {
        execSync(`powershell -NoProfile -Command "New-Item -ItemType Junction -Path '${linkPath}' -Target '${targetPath}'"`, { stdio: 'ignore' });
      } else {
        fs.symlinkSync(targetPath, linkPath, 'dir');
      }
      console.log(`[patch-cmake-paths] Created junction: ${path.basename(linkPath)} in ${path.dirname(linkPath)}`);
    } catch (err) {
      console.warn(`[patch-cmake-paths] Could not create junction:`, err.message);
    }
  }
}

function replaceInFile(filePath, replacements) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    for (const [from, to] of replacements) {
      if (content.includes(from)) {
        content = content.replace(from, to);
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`[patch-cmake-paths] Patched ${path.basename(filePath)}`);
    }
  }
}

const root = path.resolve(__dirname, '..', 'node_modules');

// 1. react-native-worklets
createJunction(
  path.join(root, 'react-native-worklets', 'android', 'Common'),
  path.join(root, 'react-native-worklets', 'Common')
);
replaceInFile(
  path.join(root, 'react-native-worklets', 'android', 'CMakeLists.txt'),
  [['${CMAKE_SOURCE_DIR}/../Common/cpp', '${CMAKE_CURRENT_SOURCE_DIR}/Common/cpp']]
);

// 2. react-native-reanimated
createJunction(
  path.join(root, 'react-native-reanimated', 'android', 'Common'),
  path.join(root, 'react-native-reanimated', 'Common')
);
createJunction(
  path.join(root, 'react-native-reanimated', 'Common', 'NativeView', 'codegen'),
  path.join(root, 'react-native-reanimated', 'android', 'build', 'generated', 'source', 'codegen', 'jni')
);
replaceInFile(
  path.join(root, 'react-native-reanimated', 'android', 'CMakeLists.txt'),
  [
    ['${CMAKE_SOURCE_DIR}/../Common/cpp', '${CMAKE_CURRENT_SOURCE_DIR}/Common/cpp'],
    ['${CMAKE_SOURCE_DIR}/../Common/NativeView', '${CMAKE_CURRENT_SOURCE_DIR}/Common/NativeView']
  ]
);
replaceInFile(
  path.join(root, 'react-native-reanimated', 'Common', 'NativeView', 'CMakeLists.txt'),
  [
    ['set(ANDROID_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../android)\nset(CODEGEN_JNI_DIR ${ANDROID_DIR}/build/generated/source/codegen/jni)', 'set(CODEGEN_JNI_DIR ${CMAKE_CURRENT_SOURCE_DIR}/codegen)'],
    ['set(ANDROID_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../android)\r\nset(CODEGEN_JNI_DIR ${ANDROID_DIR}/build/generated/source/codegen/jni)', 'set(CODEGEN_JNI_DIR ${CMAKE_CURRENT_SOURCE_DIR}/codegen)']
  ]
);

// 3. react-native-gesture-handler
createJunction(
  path.join(root, 'react-native-gesture-handler', 'android', 'shared'),
  path.join(root, 'react-native-gesture-handler', 'shared')
);
createJunction(
  path.join(root, 'react-native-gesture-handler', 'android', 'codegen'),
  path.join(root, 'react-native-gesture-handler', 'android', 'build', 'generated', 'source', 'codegen', 'jni')
);
replaceInFile(
  path.join(root, 'react-native-gesture-handler', 'android', 'CMakeLists.txt'),
  [
    ['../shared/shadowNodes/*.cpp', '${CMAKE_CURRENT_SOURCE_DIR}/shared/shadowNodes/*.cpp'],
    ['PUBLIC ../shared/shadowNodes', 'PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/shared/shadowNodes'],
    ['./build/generated/source/codegen/jni/*.cpp', '${CMAKE_CURRENT_SOURCE_DIR}/codegen/*.cpp'],
    ['PUBLIC ./build/generated/source/codegen/jni', 'PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/codegen']
  ]
);

// 4. react-native-safe-area-context
createJunction(
  path.join(root, 'react-native-safe-area-context', 'android', 'src', 'main', 'jni', 'build'),
  path.join(root, 'react-native-safe-area-context', 'android', 'build')
);
createJunction(
  path.join(root, 'react-native-safe-area-context', 'android', 'src', 'main', 'jni', 'common'),
  path.join(root, 'react-native-safe-area-context', 'common')
);
replaceInFile(
  path.join(root, 'react-native-safe-area-context', 'android', 'src', 'main', 'jni', 'CMakeLists.txt'),
  [
    ['set(LIB_ANDROID_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../..)', 'set(LIB_ANDROID_DIR ${CMAKE_CURRENT_SOURCE_DIR})'],
    ['set(LIB_COMMON_DIR ${LIB_ANDROID_DIR}/../common/cpp)', 'set(LIB_COMMON_DIR ${CMAKE_CURRENT_SOURCE_DIR}/common/cpp)']
  ]
);

// 5. react-native-screens
createJunction(
  path.join(root, 'react-native-screens', 'android', 'src', 'main', 'jni', 'build'),
  path.join(root, 'react-native-screens', 'android', 'build')
);
createJunction(
  path.join(root, 'react-native-screens', 'android', 'src', 'main', 'jni', 'common'),
  path.join(root, 'react-native-screens', 'common')
);
replaceInFile(
  path.join(root, 'react-native-screens', 'android', 'src', 'main', 'jni', 'CMakeLists.txt'),
  [
    ['set(LIB_ANDROID_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../..)', 'set(LIB_ANDROID_DIR ${CMAKE_CURRENT_SOURCE_DIR})'],
    ['set(LIB_COMMON_DIR ${LIB_ANDROID_DIR}/../common/cpp)', 'set(LIB_COMMON_DIR ${CMAKE_CURRENT_SOURCE_DIR}/common/cpp)']
  ]
);
