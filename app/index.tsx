import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

const { width, height } = Dimensions.get('window');

interface OnboardingItem {
  id: number;
  image: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const onboardingData: OnboardingItem[] = [
  {
    id: 1,
    image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&h=1200&fit=crop',
    title: 'Track Every Expense',
    description: 'Easily record and categorize your daily expenses to understand where your money goes.',
    icon: 'wallet',
  },
  {
    id: 2,
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=1200&fit=crop',
    title: 'Smart Budget Management',
    description: 'Set budgets for different categories and get alerts when you\'re close to your limits.',
    icon: 'pie-chart',
  },
  {
    id: 3,
    image: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800&h=1200&fit=crop',
    title: 'Achieve Financial Goals',
    description: 'Visualize your spending patterns and make informed decisions to reach your financial goals.',
    icon: 'trophy',
  },
];

export default function OnboardingScreen() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const scrollViewRef = useRef<ScrollView>(null);

  React.useEffect(() => {
    async function prepare() {
      try {
        // Pre-load fonts, images, make any API calls you need to do here
        // Simulate loading time
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e) {
        console.warn(e);
      } finally {
        // Tell the application to render
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      // This tells the splash screen to hide immediately
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / width);
    if (index !== currentIndex) {
      setCurrentIndex(index);
    }
  };

  const scrollToIndex = (index: number) => {
    scrollViewRef.current?.scrollTo({
      x: index * width,
      animated: true,
    });
    setCurrentIndex(index);
  };

  const handleNext = () => {
    if (currentIndex < onboardingData.length - 1) {
      scrollToIndex(currentIndex + 1);
    }
  };

  const handleSkip = () => {
    router.replace('/(auth)');
  };

  const handleGetStarted = () => {
    router.replace('/(auth)');
  };

  if (!appIsReady) {
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }} onLayout={onLayoutRootView}>
      <StatusBar barStyle="light-content" backgroundColor="#10B981" />
      
      {/* Skip Button */}
      {currentIndex < onboardingData.length - 1 && (
        <TouchableOpacity
          onPress={handleSkip}
          style={{
            position: 'absolute',
            top: 50,
            right: 20,
            zIndex: 10,
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 20,
          }}
        >
          <Text style={{ color: '#10B981', fontWeight: '600' }}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Image Slider */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {onboardingData.map((item) => (
          <View key={item.id} style={{ width, height: height * 0.65 }}>
            <Image
              source={{ uri: item.image }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 150,
                backgroundColor: 'transparent',
              }}
            />
          </View>
        ))}
      </ScrollView>

      {/* Bottom Sheet Content */}
      <View
        style={{
          backgroundColor: '#fff',
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          paddingHorizontal: 24,
          paddingTop: 32,
          paddingBottom: 40,
          marginTop: -30,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.1,
          shadowRadius: 10,
          elevation: 10,
        }}
      >
        {/* Icon */}
        <View
          style={{
            width: 60,
            height: 60,
            backgroundColor: '#10B981',
            borderRadius: 30,
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'center',
            marginBottom: 20,
          }}
        >
          <Ionicons
            name={onboardingData[currentIndex].icon}
            size={32}
            color="#fff"
          />
        </View>

        {/* Title */}
        <Text
          style={{
            fontSize: 26,
            fontWeight: 'bold',
            color: '#1F2937',
            textAlign: 'center',
            marginBottom: 12,
          }}
        >
          {onboardingData[currentIndex].title}
        </Text>

        {/* Description */}
        <Text
          style={{
            fontSize: 16,
            color: '#666',
            textAlign: 'center',
            lineHeight: 24,
            marginBottom: 32,
          }}
        >
          {onboardingData[currentIndex].description}
        </Text>

        {/* Pagination Dots */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          {onboardingData.map((_, index) => (
            <View
              key={index}
              style={{
                width: currentIndex === index ? 24 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: currentIndex === index ? '#10B981' : '#D1D5DB',
                marginHorizontal: 4,
              }}
            />
          ))}
        </View>

        {/* Action Button */}
        {currentIndex === onboardingData.length - 1 ? (
          <TouchableOpacity
            onPress={handleGetStarted}
            style={{
              backgroundColor: '#10B981',
              paddingVertical: 16,
              borderRadius: 12,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontSize: 18,
                fontWeight: 'bold',
                marginRight: 8,
              }}
            >
              Get Started
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleNext}
            style={{
              backgroundColor: '#10B981',
              paddingVertical: 16,
              borderRadius: 12,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontSize: 18,
                fontWeight: 'bold',
                marginRight: 8,
              }}
            >
              Next
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}