import { Line, Text } from "@react-three/drei";
import type { SubagentTeam } from "./subagent-layout.js";
import { OfficeLabel } from "./OfficeLabel.js";

export function SubagentTeams({ teams, labels }: { teams: SubagentTeam[]; labels: boolean }) {
  return (
    <>
      {teams.map((team) => {
        const left = (team.minColumn - 2) * 3.15 - 1.45;
        const right = (team.maxColumn - 2) * 3.15 + 1.45;
        const back = team.minRow * 3.15 - 1.4;
        const front = team.maxRow * 3.15 + 1.7;
        return (
          <group key={team.parentId}>
            <Line
              points={[
                [left, 0.005, back],
                [right, 0.005, back],
                [right, 0.005, front],
                [left, 0.005, front],
                [left, 0.005, back],
              ]}
              color="#b11f4b"
              lineWidth={2}
            />
            {labels && (
              <OfficeLabel position={[(left + right) / 2, 0.1, back]} offset={0.3}>
                <Text
                  color="#9a1a41"
                  fontSize={0.16}
                  maxWidth={right - left - 0.3}
                  textAlign="center"
                  anchorY="top"
                >
                  {team.label}
                </Text>
              </OfficeLabel>
            )}
          </group>
        );
      })}
    </>
  );
}
