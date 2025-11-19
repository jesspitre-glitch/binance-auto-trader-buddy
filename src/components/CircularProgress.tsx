interface CircularProgressProps {
  value: number; // 0-100
  size?: number;
}

export const CircularProgress = ({ value, size = 20 }: CircularProgressProps) => {
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  
  // Color based on value: red (0%) -> yellow (50%) -> green (100%)
  const getColor = (val: number) => {
    if (val >= 80) return "hsl(142, 76%, 36%)"; // green
    if (val >= 60) return "hsl(84, 81%, 44%)"; // lime
    if (val >= 40) return "hsl(48, 96%, 53%)"; // yellow
    if (val >= 20) return "hsl(25, 95%, 53%)"; // orange
    return "hsl(0, 84%, 60%)"; // red
  };

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="hsl(var(--muted))"
        strokeWidth="3"
        opacity="0.2"
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={getColor(value)}
        strokeWidth="3"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  );
};
