import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { colors } from '../../src/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName, focusedName: IconName) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? focusedName : name} size={size} color={color} />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: { borderTopColor: colors.border },
        tabBarLabelStyle: { fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', headerTitle: 'SportsOS', tabBarIcon: tabIcon('home-outline', 'home') }} />
      <Tabs.Screen
        name="checkin"
        options={{ title: 'Check-in', headerTitle: 'Verified check-in', tabBarIcon: tabIcon('location-outline', 'location') }}
      />
      <Tabs.Screen name="scan" options={{ title: 'Scan', headerTitle: 'Scan a QR code', tabBarIcon: tabIcon('qr-code-outline', 'qr-code') }} />
      <Tabs.Screen
        name="bookings"
        options={{ title: 'Bookings', headerTitle: 'My bookings', tabBarIcon: tabIcon('calendar-outline', 'calendar') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: tabIcon('person-circle-outline', 'person-circle') }}
      />
    </Tabs>
  );
}
