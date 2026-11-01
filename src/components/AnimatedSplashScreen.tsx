import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { BrandColors } from '../constants/theme';

interface AnimatedSplashScreenProps {
  isAppReady: boolean;
  onAnimationComplete: () => void;
}

const { width } = Dimensions.get('window');

export const AnimatedSplashScreen: React.FC<AnimatedSplashScreenProps> = ({
  isAppReady,
  onAnimationComplete,
}) => {
  // Animation Values initialized via useMemo (React 19 & React Compiler compliant)
  const containerOpacity = useMemo(() => new Animated.Value(1), []);
  const iconScale = useMemo(() => new Animated.Value(0.82), []);
  const iconOpacity = useMemo(() => new Animated.Value(0), []);
  const textOpacity = useMemo(() => new Animated.Value(0), []);
  const textTranslateY = useMemo(() => new Animated.Value(14), []);
  const taglineOpacity = useMemo(() => new Animated.Value(0), []);
  const accentGlowScale = useMemo(() => new Animated.Value(0.7), []);
  const accentGlowOpacity = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    // Stage 1: Immediate entrance sequence
    Animated.parallel([
      // Soft background glow
      Animated.timing(accentGlowOpacity, {
        toValue: 0.6,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(accentGlowScale, {
        toValue: 1.1,
        duration: 900,
        useNativeDriver: true,
      }),
      // Emblem Scale & Fade in
      Animated.timing(iconOpacity, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.spring(iconScale, {
        toValue: 1,
        friction: 6.5,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Stage 2: Typography reveals smoothly
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateY, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 500,
          delay: 150,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [
    accentGlowOpacity,
    accentGlowScale,
    iconOpacity,
    iconScale,
    taglineOpacity,
    textOpacity,
    textTranslateY,
  ]);

  // Stage 3: Smooth exit transition when app is ready (approx 1.2s to 1.8s)
  useEffect(() => {
    if (!isAppReady) return;

    // Minimum visible display duration of ~1300ms so the user experiences the branded startup
    const timer = setTimeout(() => {
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 380,
        useNativeDriver: true,
      }).start(() => {
        onAnimationComplete();
      });
    }, 1300);

    return () => clearTimeout(timer);
  }, [isAppReady, containerOpacity, onAnimationComplete]);

  return (
    <Animated.View
      style={[
        styles.overlayContainer,
        {
          opacity: containerOpacity,
        },
      ]}
      pointerEvents={isAppReady ? 'none' : 'auto'}
    >
      {/* Background Soft Radiant Circles */}
      <Animated.View
        style={[
          styles.glowCircle,
          {
            opacity: accentGlowOpacity,
            transform: [{ scale: accentGlowScale }],
          },
        ]}
      />

      {/* Centered Brand Content */}
      <View style={styles.centerBox}>
        {/* Milk Droplet & Bottle Emblem */}
        <Animated.View
          style={[
            styles.iconWrapper,
            {
              opacity: iconOpacity,
              transform: [{ scale: iconScale }],
            },
          ]}
        >
          <Image
            source={require('../../assets/images/milk-bill-icon-white.png')}
            style={styles.logoImage}
            contentFit="contain"
            priority="high"
          />
        </Animated.View>

        {/* Brand Name "Milk Bill" */}
        <Animated.View
          style={[
            styles.textWrapper,
            {
              opacity: textOpacity,
              transform: [{ translateY: textTranslateY }],
            },
          ]}
        >
          <Text style={styles.brandTitle}>
            Milk<Text style={styles.brandTitleAccent}> Bill</Text>
          </Text>

          {/* Tagline */}
          <Animated.View style={{ opacity: taglineOpacity }}>
            <Text style={styles.brandSubtitle}>
              DAIRY &amp; BILLING MANAGEMENT
            </Text>
          </Animated.View>
        </Animated.View>
      </View>

      {/* Bottom Minimal Indicator */}
      <View style={styles.footerContainer}>
        <View style={styles.pillBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.footerText}>Secure Dairy Cloud</Text>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 999999,
    elevation: 999999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glowCircle: {
    position: 'absolute',
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: (width * 0.9) / 2,
    backgroundColor: '#E0F2FE', // soft azure halo
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    width: 140,
    height: 140,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
    marginBottom: 20,
  },
  logoImage: {
    width: 110,
    height: 110,
  },
  textWrapper: {
    alignItems: 'center',
  },
  brandTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.6,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
  brandTitleAccent: {
    color: BrandColors.primaryDark,
  },
  brandSubtitle: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  footerContainer: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981', // emerald green online dot
  },
  footerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.2,
  },
});

export default AnimatedSplashScreen;
