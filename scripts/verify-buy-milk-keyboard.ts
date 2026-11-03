// @ts-nocheck
declare const require: any;

console.log('=== VERIFYING BUY MILK KEYBOARD OVERLAP FIX ===\n');

const fs = require('fs');

function testBuyScreenKeyboardFix() {
  console.log('Test 1: Inspecting src/app/supplier/buy.tsx...');
  const content = fs.readFileSync('src/app/supplier/buy.tsx', 'utf8');

  // 1. Keyboard visibility & height tracking
  if (!content.includes('const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);')) {
    throw new Error('buy.tsx missing isKeyboardVisible state');
  }
  if (!content.includes('const [keyboardHeight, setKeyboardHeight] = useState(0);')) {
    throw new Error('buy.tsx missing keyboardHeight state');
  }
  if (!content.includes('Keyboard.addListener') || !content.includes('keyboardDidShow')) {
    throw new Error('buy.tsx missing Keyboard.addListener for show and hide events');
  }

  // 2. Modal layout dynamic adjustment
  if (!content.includes('isKeyboardVisible && {') || !content.includes("maxHeight: '94%'")) {
    throw new Error('buy.tsx missing modal dynamic adjustment when keyboard is visible');
  }

  // 3. KeyboardAvoidingView behavior & offset
  if (
    !content.includes("behavior={Platform.OS === 'ios' ? 'padding' : undefined}") ||
    !content.includes("keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}")
  ) {
    throw new Error('buy.tsx KeyboardAvoidingView missing proper behavior or keyboardVerticalOffset');
  }

  // 4. ScrollView dynamic paddingBottom
  if (
    !content.includes('keyboardShouldPersistTaps="handled"') ||
    !content.includes('paddingBottom: isKeyboardVisible')
  ) {
    throw new Error('buy.tsx ScrollView missing keyboardShouldPersistTaps or dynamic paddingBottom');
  }

  // 5. Quantity & Rate input focus auto-scroll
  if (!content.includes('buyScrollViewRef.current?.scrollToEnd({ animated: true });')) {
    throw new Error('buy.tsx missing auto-scroll to end on focus');
  }

  // 6. Save Purchase button intact
  if (!content.includes('Save Purchase')) {
    throw new Error('buy.tsx missing Save Purchase button');
  }

  console.log('✓ buy.tsx: Dynamic keyboard adjustment, dynamic scroll padding, and auto-scroll verified.\n');
}

function testSupplierTabKeyboardFix() {
  console.log('Test 2: Inspecting src/app/(tabs)/supplier.tsx...');
  const content = fs.readFileSync('src/app/(tabs)/supplier.tsx', 'utf8');

  if (!content.includes('const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);')) {
    throw new Error('supplier.tsx missing isKeyboardVisible state');
  }
  if (!content.includes('isKeyboardVisible && {') || !content.includes("maxHeight: '94%'")) {
    throw new Error('supplier.tsx missing modal dynamic adjustment');
  }
  if (
    !content.includes("behavior={Platform.OS === 'ios' ? 'padding' : undefined}") ||
    !content.includes("keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}")
  ) {
    throw new Error('supplier.tsx KeyboardAvoidingView missing proper behavior or offset');
  }
  if (
    !content.includes('keyboardShouldPersistTaps="handled"') ||
    !content.includes('paddingBottom: isKeyboardVisible')
  ) {
    throw new Error('supplier.tsx ScrollView missing dynamic paddingBottom');
  }

  console.log('✓ supplier.tsx: Buy modal keyboard avoidance verified.\n');
}

function runAll() {
  testBuyScreenKeyboardFix();
  testSupplierTabKeyboardFix();
  console.log('🎉 ALL BUY MILK KEYBOARD VERIFICATION TESTS PASSED PERFECTLY!');
}

runAll();

