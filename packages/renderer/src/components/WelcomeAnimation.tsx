import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';

type Props = {
	name: string;
	onDone: () => void;
	onMidway?: () => void; // called after subtext finishes entrance
};

export function WelcomeAnimation({ name, onDone, onMidway }: Props)
{
	const { theme } = useTheme();
	const isLight = theme === 'light';
	const [showHeader, setShowHeader] = useState(false);
	const [showSub, setShowSub] = useState(false);
	const [fadeOutText, setFadeOutText] = useState(false);
	const [fadeOutCurtain, setFadeOutCurtain] = useState(false);
	const [fadeInCurtain, setFadeInCurtain] = useState(false);
	const timers = useRef<number[]>([]);
	const onDoneRef = useRef(onDone);
	const onMidwayRef = useRef(onMidway);

	useEffect(() =>
	{
		onDoneRef.current = onDone;
	}, [onDone]);
	useEffect(() =>
	{
		onMidwayRef.current = onMidway;
	}, [onMidway]);

	useEffect(() =>
	{
		const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		// Dramatic reveal: slow curtain fade-in and longer pause before text
		const preDelay = prefersReduced ? 300 : 2000; // wait before text starts (after curtain)
		const headerDelay = preDelay + (prefersReduced ? 50 : 0);
		const subDelay = preDelay + (prefersReduced ? 250 : 1000); // slightly longer stagger for readability
		const linger = prefersReduced ? 300 : 2000; // linger after both visible
		const textFade = prefersReduced ? 150 : 450;
		const textInDuration = prefersReduced ? 150 : 700; // matches duration-700 class
		const curtainFade = prefersReduced ? 200 : 600;

		// Trigger curtain fade-in first (next frame) so it animates from 0 -> 1
		timers.current.push(window.setTimeout(() => setFadeInCurtain(true), 0));

		// Stagger in text after pre-delay
		timers.current.push(window.setTimeout(() => setShowHeader(true), headerDelay));
		timers.current.push(window.setTimeout(() => setShowSub(true), subDelay));

		// Linger, then fade text out, then fade curtain out
		const start = Math.max(headerDelay, subDelay);
		timers.current.push(window.setTimeout(() => setFadeOutText(true), start + linger));
		timers.current.push(window.setTimeout(() => setFadeOutCurtain(true), start + linger + textFade));
		timers.current.push(
			window.setTimeout(() =>
			{
				if (onDoneRef.current) onDoneRef.current();
			}, start + linger + textFade + curtainFade)
		);

		// Notify when subtext has finished its entrance animation
		if (onMidwayRef.current)
		{
			timers.current.push(
				window.setTimeout(() =>
				{
					if (onMidwayRef.current) onMidwayRef.current();
				}, subDelay + textInDuration)
			);
		}

		return () =>
		{
			timers.current.forEach((t) => window.clearTimeout(t));
			timers.current = [];
		};
	}, []);

	return (
		<div
			className={`fixed inset-0 z-[9999] flex items-center justify-center ${isLight ? 'bg-white' : 'bg-black'
				} transition-opacity ${fadeOutCurtain
					? 'duration-700 opacity-0'
					: fadeInCurtain
						? 'duration-1000 opacity-100'
						: 'duration-1000 opacity-0'
				}`}
		>
			<div className="text-center select-none">
				<h2
					className={`text-4xl md:text-5xl font-semibold tracking-tight transition-opacity duration-700 ${showHeader && !fadeOutText ? 'opacity-100' : 'opacity-0'
						} ${isLight ? 'text-black' : ''}`}
				>
					{`Welcome ${name}`}
				</h2>
				<p
					className={`mt-2 text-base md:text-lg transition-opacity duration-700 ${showSub && !fadeOutText ? 'opacity-100' : 'opacity-0'
						} ${isLight ? 'text-black/70' : 'text-fg-muted'}`}
				>
					to your new workspace
				</p>
			</div>
		</div>
	);
}

export default WelcomeAnimation;
