interface CircularProgressProps {
  value: number; // 0-100
  size?: number;
  passed?: boolean; // Whether the condition is actually passed
}

export const CircularProgress = ({ value, size = 20, passed }: CircularProgressProps) => {
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  
  // Color based on passed status first, then value
  const getColor = (val: number, isPassed?: boolean) => {
    // If passed is explicitly set, use it to determine color
    if (isPassed === false) return "hsl(0, 84%, 60%)"; // red - failed
    if (isPassed === true) return "hsl(142, 76%, 36%)"; // green - passed
    
    // Fallback to value-based coloring if passed is not set
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
        stroke={getColor(value, passed)}
        strokeWidth="3"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  );
};
