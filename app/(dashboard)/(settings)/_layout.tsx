import { View, Text } from 'react-native'
import React from 'react'
import { Stack } from 'expo-router'

export default function setting_layout() {
  return (
    <View>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
       
      </Stack>
    </View>
  )
}